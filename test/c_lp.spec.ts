import { expect } from 'chai'
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
import { Contract, ContractFactory, BigNumber, Wallet, utils, providers, ethers } from 'ethers'
import { Direction } from '../test/shared/watcher-utils'

import L1ERC20Json from '../artifacts/contracts/ERC20.sol/ERC20.json'
import L1ERC20GatewayJson from '../artifacts/contracts/L1ERC20Gateway.sol/L1ERC20Gateway.json'
import L2DepositedERC20Json from '../artifacts-ovm/contracts/L2DepositedERC20.sol/L2DepositedERC20.json'

import L1LiquidityPoolJson from '../artifacts/contracts/LP/L1LiquidityPool.sol/L1LiquidityPool.json'
import L2LiquidityPoolJson from '../artifacts-ovm/contracts/LP/L2LiquidityPool.sol/L2LiquidityPool.json'

import { OptimismEnv } from '../test/shared/env'

import * as fs from 'fs'

describe('System setup', async () => {

  let Factory__L1LiquidityPool: ContractFactory
  let Factory__L2LiquidityPool: ContractFactory
  let Factory__L1ERC20: ContractFactory
  let Factory__L2DepositedERC20: ContractFactory
  let Factory__L1ERC20Gateway: ContractFactory

  let L1LiquidityPool: Contract
  let L2LiquidityPool: Contract
  let L1ERC20: Contract
  let L2DepositedERC20: Contract
  let L1ERC20Gateway: Contract

  let env: OptimismEnv

  //Test ERC20 
  const initialAmount = utils.parseEther("10000000000")
  const tokenName = 'OMGXTest'
  const tokenDecimals = 18
  const tokenSymbol = 'OMGX'

  const getBalances = async (
    _address: string, 
    _L1LiquidityPool=L1LiquidityPool, 
    _L2LiquidityPool=L2LiquidityPool, 
    _env=env
   ) => {

    const L1LPFeeBalance = await _L1LiquidityPool.feeBalanceOf(_address)
    const L2LPFeeBalance = await _L2LiquidityPool.feeBalanceOf(_address)

    const aliceL1Balance = await _env.alicel1Wallet.getBalance()
    const aliceL2Balance = await _env.alicel2Wallet.getBalance()

    const bobL1Balance = await _env.bobl1Wallet.getBalance()
    const bobL2Balance = await _env.bobl2Wallet.getBalance()
/*
    console.log("\nbobL1Balance:", bobL1Balance.toString())
    console.log("bobL2Balance:", bobL2Balance.toString())
    console.log("aliceL1Balance:", aliceL1Balance.toString())
    console.log("aliceL2Balance:", aliceL2Balance.toString())
    console.log("L1LPBalance:", L1LPBalance.toString())
    console.log("L2LPBalance:", L2LPBalance.toString())
    console.log("L1LPFeeBalance:", L1LPFeeBalance.toString())
    console.log("L2LPFeeBalance:", L2LPFeeBalance.toString())
*/
    return {
      L1LPFeeBalance,
      L2LPFeeBalance,
      aliceL1Balance,
      aliceL2Balance,
      bobL1Balance,
      bobL2Balance,
    }
  }

  /************* BOB owns all the pools, and ALICE mints a new token ***********/
  before(async () => {

    env = await OptimismEnv.new()

    Factory__L1LiquidityPool = new ContractFactory(
      L1LiquidityPoolJson.abi,
      L1LiquidityPoolJson.bytecode,
      env.bobl1Wallet
    )

    Factory__L2LiquidityPool = new ContractFactory(
      L2LiquidityPoolJson.abi,
      L2LiquidityPoolJson.bytecode,
      env.bobl2Wallet
    )

    Factory__L1ERC20 = new ContractFactory(
      L1ERC20Json.abi,
      L1ERC20Json.bytecode,
      env.bobl1Wallet
    )

    Factory__L2DepositedERC20 = new ContractFactory(
      L2DepositedERC20Json.abi,
      L2DepositedERC20Json.bytecode,
      env.bobl2Wallet
    )

    Factory__L1ERC20Gateway = new ContractFactory(
      L1ERC20GatewayJson.abi,
      L1ERC20GatewayJson.bytecode,
      env.bobl1Wallet
    )

  })

  before(async () => {
    //Set up the L2LP
    L2LiquidityPool = await Factory__L2LiquidityPool.deploy(
      env.watcher.l2.messengerAddress,
    )
    await L2LiquidityPool.deployTransaction.wait()
    console.log("L2LiquidityPool deployed to:", L2LiquidityPool.address)

    L1LiquidityPool = await Factory__L1LiquidityPool.deploy(
      L2LiquidityPool.address,
      env.watcher.l1.messengerAddress,
      env.L2ETHGateway.address,
    )
    await L1LiquidityPool.deployTransaction.wait()
    console.log("L1LiquidityPool deployed to:", L1LiquidityPool.address)
    
    const L2LiquidityPoolTX = await L2LiquidityPool.init(
      /* userRewardFeeRate 3.5% */ 35, 
      /* ownerRewardFeeRate 1.5% */ 15, 
      L1LiquidityPool.address
    )
    
    await L2LiquidityPoolTX.wait()
    console.log('L2 LP initialized with the L1LiquidityPool.address:',L2LiquidityPoolTX.hash);

    //Mint a new token on L1 and set up the L1 and L2 infrastructure
    // [initialSupply, name, decimals, symbol]
    // this is owned by bobl1Wallet
    L1ERC20 = await Factory__L1ERC20.deploy(
      initialAmount,
      tokenName,
      tokenDecimals,
      tokenSymbol
    )
    await L1ERC20.deployTransaction.wait()
    console.log("L1ERC20 deployed to:", L1ERC20.address)

    //Set up things on L2 for this new token
    // [l2MessengerAddress, name, symbol]
    L2DepositedERC20 = await Factory__L2DepositedERC20.deploy(
      env.watcher.l2.messengerAddress,
      tokenName,
      tokenSymbol
    )
    await L2DepositedERC20.deployTransaction.wait()
    console.log("L2DepositedERC20 deployed to:", L2DepositedERC20.address)
    
    //Deploy a gateway for the new token
    // [L1_ERC20.address, OVM_L2DepositedERC20.address, l1MessengerAddress]
    L1ERC20Gateway = await Factory__L1ERC20Gateway.deploy(
      L1ERC20.address,
      L2DepositedERC20.address,
      env.watcher.l1.messengerAddress,
    )
    await L1ERC20Gateway.deployTransaction.wait()
    console.log("L1ERC20Gateway deployed to:", L1ERC20Gateway.address)
    
    //Initialize the contracts for the new token
    const initL2 = await L2DepositedERC20.init(L1ERC20Gateway.address);
    await initL2.wait();
    console.log('L2 ERC20 initialized:',initL2.hash);
    
    //Register Erc20 token addresses in L1 Liquidity pool
    await L1LiquidityPool.registerTokenAddress(L1ERC20.address, L2DepositedERC20.address);
  })

  before(async () => {

    fs.readFile('./deployment/local/addresses.json', 'utf8' , (err, data) => {
      
      if (err) {
        console.error(err)
        return
      }

      const addressArray = JSON.parse(data);      
      
      //this will either update or overwrite, depending, but either is fine 
      addressArray['L1LiquidityPool'] = L1LiquidityPool.address;
      addressArray['L2LiquidityPool'] = L2LiquidityPool.address;

      fs.writeFile('./deployment/local/addresses.json', JSON.stringify(addressArray, null, 2), err => {
        if (err) {
          console.log('Error LP address to file:', err)
        } else {
          console.log('Successfully added LP address to file')
        }
      })
    })
  })

  it('should deposit ERC20 token to L2', async () => {
    const depositL2ERC20Amount = utils.parseEther("1000");
    
    const preL1ERC20Balance = await L1ERC20.balanceOf(env.bobl1Wallet.address)
    const preL2ERC20Balance = await L2DepositedERC20.balanceOf(env.bobl2Wallet.address)

    const approveL1ERC20TX = await L1ERC20.approve(
      L1ERC20Gateway.address,
      depositL2ERC20Amount,
    )
    await approveL1ERC20TX.wait()

    await env.waitForXDomainTransaction(
      L1ERC20Gateway.deposit(depositL2ERC20Amount),
      Direction.L1ToL2
    )
    
    const postL1ERC20Balance = await L1ERC20.balanceOf(env.bobl1Wallet.address);
    const postL2ERC20Balance = await L2DepositedERC20.balanceOf(env.bobl2Wallet.address)

    expect(preL1ERC20Balance).to.deep.eq(
      postL1ERC20Balance.add(depositL2ERC20Amount)
    )

    expect(preL2ERC20Balance).to.deep.eq(
      postL2ERC20Balance.sub(depositL2ERC20Amount)
    )
  })

  it('should transfer ERC20 token to Alice and Kate', async () => {

    const transferL2ERC20Amount = utils.parseEther("150")

    const preBobL2ERC20Balance = await L2DepositedERC20.balanceOf(env.bobl2Wallet.address)
    const preAliceL2ERC20Balance = await L2DepositedERC20.balanceOf(env.alicel2Wallet.address)
    const preKateL2ERC20Balance = await L2DepositedERC20.balanceOf(env.katel2Wallet.address)

    const tranferToAliceTX = await L2DepositedERC20.transfer(env.alicel2Wallet.address, transferL2ERC20Amount)
    await tranferToAliceTX.wait()

    const tranferToKateTX = await L2DepositedERC20.transfer(env.katel2Wallet.address, transferL2ERC20Amount)
    await tranferToKateTX.wait()

    const postBobL2ERC20Balance = await L2DepositedERC20.balanceOf(env.bobl2Wallet.address)
    const postAliceL2ERC20Balance = await L2DepositedERC20.balanceOf(env.alicel2Wallet.address)
    const postKateL2ERC20Balance = await L2DepositedERC20.balanceOf(env.katel2Wallet.address)

    expect(preBobL2ERC20Balance).to.deep.eq(
      postBobL2ERC20Balance.add(transferL2ERC20Amount).add(transferL2ERC20Amount)
    )

    expect(preAliceL2ERC20Balance).to.deep.eq(
      postAliceL2ERC20Balance.sub(transferL2ERC20Amount)
    )

    expect(preKateL2ERC20Balance).to.deep.eq(
      postKateL2ERC20Balance.sub(transferL2ERC20Amount)
    )
  })

  it('should register the pool', async () => {
    
    const registerPoolTX = await L2LiquidityPool.registerPool(
      L1ERC20.address,
      L2DepositedERC20.address,  
    )
    await registerPoolTX.wait()

    const poolInfo = await L2LiquidityPool.poolInfo(L2DepositedERC20.address)

    expect(poolInfo.l1TokenAddress).to.deep.eq(L1ERC20.address)
    expect(poolInfo.l2TokenAddress).to.deep.eq(L2DepositedERC20.address)
  })  

  it('shouldn\'t update the pool', async () => {
    const registerPoolTX = await L2LiquidityPool.registerPool(
      L1ERC20.address,
      L2DepositedERC20.address,  
    )
    await expect(registerPoolTX.wait()).to.be.eventually.rejected;
  })

  it('should add the liquidity', async () => {
    const addLiquidityAmount = utils.parseEther("100")

    const preBobL2ERC20Balance = await L2DepositedERC20.balanceOf(env.bobl2Wallet.address)
    const preAliceL2ERC20Balance = await L2DepositedERC20.balanceOf(env.alicel2Wallet.address)

    const approveBobL2TX = await L2DepositedERC20.approve(
      L2LiquidityPool.address,
      addLiquidityAmount,
    )
    await approveBobL2TX.wait()
    
    await env.waitForXDomainTransaction(
      L2LiquidityPool.addLiquidity(
        addLiquidityAmount,
        L2DepositedERC20.address
      ),
      Direction.L2ToL1
    )

    const approveAliceL2TX = await L2DepositedERC20.connect(env.alicel2Wallet).approve(
      L2LiquidityPool.address,
      addLiquidityAmount,
    )
    await approveAliceL2TX.wait()

    await env.waitForXDomainTransaction(
      L2LiquidityPool.connect(env.alicel2Wallet).addLiquidity(
        addLiquidityAmount,
        L2DepositedERC20.address
      ),
      Direction.L2ToL1
    )
    
    // ERC20 balance
    const postBobL2ERC20Balance = await L2DepositedERC20.balanceOf(env.bobl2Wallet.address)
    const postAliceL2ERC20Balance = await L2DepositedERC20.balanceOf(env.alicel2Wallet.address)

    expect(preBobL2ERC20Balance).to.deep.eq(
      postBobL2ERC20Balance.add(addLiquidityAmount)
    )
    expect(preAliceL2ERC20Balance).to.deep.eq(
      postAliceL2ERC20Balance.add(addLiquidityAmount)
    )

    // User deposit amount
    const BobPoolAmount = await L2LiquidityPool.userInfo(L2DepositedERC20.address, env.bobl2Wallet.address);
    const AlicePoolAmount = await L2LiquidityPool.userInfo(L2DepositedERC20.address, env.alicel2Wallet.address);

    expect(BobPoolAmount.amount).to.deep.eq(addLiquidityAmount)
    expect(AlicePoolAmount.amount).to.deep.eq(addLiquidityAmount)

    // Pool Balance
    const L2LPERC20Balance = await L2DepositedERC20.balanceOf(L2LiquidityPool.address)
    const L1LPERC20Balance = await L1ERC20.balanceOf(L1LiquidityPool.address)

    expect(L2LPERC20Balance).to.deep.eq(addLiquidityAmount)
    expect(L1LPERC20Balance).to.deep.eq(addLiquidityAmount)

  })

  it("should fast exit L2", async () => {
    const fastExitAmount = utils.parseEther("10")

    const approveKateL2TX = await L2DepositedERC20.connect(env.katel2Wallet).approve(
      L2LiquidityPool.address,
      fastExitAmount,
    )
    await approveKateL2TX.wait()

    await env.waitForXDomainTransaction(
      L2LiquidityPool.connect(env.katel2Wallet).clientDepositL2(
        fastExitAmount,
        L2DepositedERC20.address
      ),
      Direction.L2ToL1
    )

    const poolInfo = await L2LiquidityPool.poolInfo(L2DepositedERC20.address)

    expect(poolInfo.accOwnerReward).to.deep.eq(fastExitAmount.mul(15).div(1000))
  })
})