/* eslint-disable quotes */
/*
Copyright 2019-present OmiseGO Pte Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License. */

import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import { hexlify } from "@ethersproject/bytes";
import { parseUnits, parseEther } from "@ethersproject/units";
import { Watcher } from "@eth-optimism/watcher";
import { ethers, BigNumber } from "ethers";

import Web3Modal from "web3modal";

import '@metamask/legacy-web3'

import { orderBy } from 'lodash';
import BN from 'bn.js';
import Web3 from 'web3';

import { getToken } from 'actions/tokenAction';
import { getNFTs, addNFT } from 'actions/nftAction';
import { setMinter } from 'actions/setupAction';

import { openAlert, openError } from 'actions/uiAction';
import { WebWalletError } from 'services/errorService';

import L1LPJson from '../deployment/artifacts/contracts/LP/L1LiquidityPool.sol/L1LiquidityPool.json'
import L2LPJson from '../deployment/artifacts-ovm/contracts/LP/L2LiquidityPool.sol/L2LiquidityPool.json'
import L1ERC20Json from '../deployment/artifacts/contracts/ERC20.sol/ERC20.json'
import L2DepositedERC20Json from '../deployment/artifacts-ovm/contracts/L2DepositedERC20.sol/L2DepositedERC20.json'
import L1ERC20GatewayJson from '../deployment/artifacts/contracts/L1ERC20Gateway.sol/L1ERC20Gateway.json'
import ERC721Json from '../deployment/artifacts-ovm/contracts/ERC721Mock.sol/ERC721Mock.json'
import L2TokenPoolJson from '../deployment/artifacts-ovm/contracts/TokenPool.sol/TokenPool.json'
import AtomicSwapJson from '../deployment/artifacts-ovm/contracts/AtomicSwap.sol/AtomicSwap.json'

import { powAmount, logAmount } from 'util/amountConvert';
import { getAllNetworks } from 'util/networkName';

import { ETHERSCAN_URL, OMGX_WATCHER_URL, L1ETHGATEWAY, L2DEPOSITEDERC20 } from "Settings";

//All the current addresses
const localAddresses = require(`../deployment/local/addresses.json`);
const rinkebyAddresses = require(`../deployment/rinkeby/addresses.json`);

const web3Modal = new Web3Modal({
  cacheProvider: true, // optional
  providerOptions: {},
});

class NetworkService {

  constructor () {

    this.web3 = null;
    // based on MetaMask
    this.web3Provider = null;

    this.l1Web3Provider = null;
    this.l2Web3Provider = null;

    this.l1Provider = null;
    this.l2Provider = null;

    this.provider = null;
    this.environment = null;
    
    this.L1ETHGatewayContract = null;
    this.OVM_L1ERC20Gateway = null;
    
    this.L2ETHGatewayContract = null;
    this.OVM_L2DepositedERC20 = null;

    // hardcoded - for balance
    this.ERC20L1Contract = null;
    this.ERC20L2Contract = null;

    this.ERC721Contract = null;

    this.L2TokenPoolContract = null;
    this.AtomicSwapContract = null;

    // L1 or L2
    this.L1orL2 = null;
    this.networkName = null;

    // Watcher
    this.watcher = null;

    // addresses
    this.ERC20Address = null;
    this.ERC721Address = null;
    this.l1ETHGatewayAddress = null;
    this.L1ERC20GatewayAddress = null;
    this.L2DepositedERC20Address = null;
    this.l1MessengerAddress = null;
    this.L1LPAddress = null;
    this.L2LPAddress = null;
    this.l2ETHGatewayAddress = '0x4200000000000000000000000000000000000006';
    this.l2MessengerAddress = '0x4200000000000000000000000000000000000007';

    // chain ID
    this.chainID = null;
  }

  async enableBrowserWallet() {

    console.log("NS: enableBrowserWallet()")
    try {
      // connect to the wallet
      this.provider = await web3Modal.connect();
      
      // can't get rid of it at this moment, there are 
      // other functions that use this 
      this.web3Provider = new Web3Provider(this.provider);
     
      return true;
    } catch(error) {
      return false;
    }

  }

  bindProviderListeners() {
    this.provider.on("accountsChanged", () => {
      window.location.reload();
    })

    this.provider.on("chainChanged", () => {
      window.location.reload();
    })
  }

  async mintAndSendNFT(receiverAddress, ownerName, tokenURI) {
    
    try {
      let meta = ownerName + "#" + Date.now().toString() + "#" + tokenURI;
      
      console.log("meta:",meta)
      console.log("receiverAddress:",receiverAddress)

      let nft = await this.ERC721Contract.mintNFT(
        receiverAddress,
        meta
      )
      
      await nft.wait()
      console.log("New ERC721:",nft)
      return true;
    }
    catch (error) {
      return false;
    }
  }

  async initializeAccounts ( networkName ) {
    
    console.log("NS: initializeAccounts() for",networkName)

    try {
      
      let addresses;
      if (networkName === 'local') addresses = localAddresses;
      else addresses = rinkebyAddresses;

      //at this point, the wallet should be connected
      this.account = await this.web3Provider.getSigner().getAddress();
      console.log("this.account",this.account)
      const network = await this.web3Provider.getNetwork();

      this.chainID = network.chainId;
      this.networkName = networkName;
      console.log("NS: networkName:",this.networkName)
      //console.log("NS: account:",this.account)
      console.log("NS: this.chainID:",this.chainID)

      //there are numerous possible chains we could be on
      //either local, rinkeby etc
      //and then, also, either L1 or L2

      //at this point, we only know whether we want to be on local or rinkeby etc
      if(networkName === 'local' && network.chainId === 28) {
        //ok, that's reasonable
        //local deployment, L2
        this.L1orL2 = 'L2';
      } else if (networkName === 'local' && network.chainId === 31337) {
        //ok, that's reasonable
        //local deployment, L1
        this.L1orL2 = 'L1';
      } else if (networkName === 'rinkeby' && network.chainId === 4) {
        //ok, that's reasonable
        //rinkeby, L1
        this.L1orL2 = 'L1';
      } else if (networkName === 'rinkeby' && network.chainId === 28) {
        //ok, that's reasonable
        //rinkeby, L2
        this.L1orL2 = 'L2';
      } else {
        return 'wrongnetwork'
      }

      //dispatch(setLayer(this.L1orL2))
      //const dispatch = useDispatch();

      // defines the set of possible networks
      const nw = getAllNetworks();

      this.l1Web3Provider = new Web3(new Web3.providers.HttpProvider(nw[networkName]['L1']['rpcUrl']));
      this.l2Web3Provider = new Web3(new Web3.providers.HttpProvider(nw[networkName]['L2']['rpcUrl']));

      this.l1Provider = new JsonRpcProvider(nw[networkName]['L1']['rpcUrl']);
      this.l2Provider = new JsonRpcProvider(nw[networkName]['L2']['rpcUrl']);

      // addresses
      this.ERC20Address = addresses.L1ERC20;
      this.l1ETHGatewayAddress = addresses.l1ETHGatewayAddress;
      this.L1ERC20GatewayAddress = addresses.L1ERC20Gateway
      this.L2DepositedERC20Address = addresses.L2DepositedERC20
      this.l1MessengerAddress = addresses.l1MessengerAddress;
      this.L1LPAddress = addresses.L1LiquidityPool;
      this.L2LPAddress = addresses.L2LiquidityPool;
      this.ERC721Address = addresses.L2ERC721;
      this.L2TokenPoolAddress = addresses.L2TokenPool;
      this.AtomicSwapAddress = addresses.AtomicSwap;

      this.L1ETHGatewayContract = new ethers.Contract(
        this.l1ETHGatewayAddress, 
        L1ETHGATEWAY, 
        this.web3Provider.getSigner(),
      );

      this.L2ETHGatewayContract = new ethers.Contract(
        this.l2ETHGatewayAddress,
        L2DEPOSITEDERC20,
        this.web3Provider.getSigner(),
      );

      this.OVM_L1ERC20Gateway = new ethers.Contract(
        this.L1ERC20GatewayAddress, 
        L1ERC20GatewayJson.abi, 
        this.web3Provider.getSigner(),
      );

      this.OVM_L2DepositedERC20 = new ethers.Contract(
        this.L2DepositedERC20Address, 
        L2DepositedERC20Json.abi, 
        this.web3Provider.getSigner(),
      );

      // For the balance
      this.ERC20L1Contract = new this.l1Web3Provider.eth.Contract(
        L1ERC20Json.abi,
        this.ERC20Address,
      );

      this.ERC20L2Contract = new this.l2Web3Provider.eth.Contract(
        L2DepositedERC20Json.abi,
        this.L2DepositedERC20Address,
      );

      // Liquidity pools
      this.L1LPContract = new ethers.Contract(
        this.L1LPAddress,
        L1LPJson.abi,
        this.web3Provider.getSigner(),
      );
      
      this.L2LPContract = new ethers.Contract(
        this.L2LPAddress,
        L2LPJson.abi,
        this.web3Provider.getSigner(),
      );

      this.ERC721Contract = new this.l2Web3Provider.eth.Contract(
        ERC721Json.abi,
        this.ERC721Address,
      );

      this.L2TokenPoolContract = new ethers.Contract(
        this.L2TokenPoolAddress,
        L2TokenPoolJson.abi,
        this.web3Provider.getSigner(),
      );

      this.L2TokenPoolContract = new ethers.Contract(
        this.L2TokenPoolAddress,
        L2TokenPoolJson.abi,
        this.web3Provider.getSigner(),
      );

      this.AtomicSwapContract = new ethers.Contract(
        this.AtomicSwapAddress,
        AtomicSwapJson.abi,
        this.web3Provider.getSigner(),
      )

      const ERC721Owner = await this.ERC721Contract.methods.owner().call({ from: this.account });

      if(this.account === ERC721Owner) {
        //console.log("Great, you are the NFT owner")
        setMinter( true )
      } else {
        //console.log("Sorry, not the NFT owner")
        setMinter( false )
      }
      //Fire up the new watcher
      //const addressManager = getAddressManager(bobl1Wallet)
      //const watcher = await initWatcher(l1Provider, this.l2Provider, addressManager)

      this.watcher = new Watcher({
        l1: {
          provider: this.l1Provider,
          messengerAddress: this.l1MessengerAddress
        },
        l2: {
          provider: this.l2Provider,
          messengerAddress: this.l2MessengerAddress
        }
      })

      this.bindProviderListeners();
      
      return 'enabled'

    } catch (error) {
      console.log(error);
      return false;
    
    }
  }

  async checkStatus () {
    return {
      connection: true,
      byzantine: false,
      watcherSynced: true,
      lastSeenBlock: 0,
    };
  }

  async addL2Network() {
    const nw = getAllNetworks();
    const chainParam = {
      chainId: '0x' + nw.rinkeby.L2.chainId.toString(16),
      chainName: "OMGX L2",
      rpcUrls: [nw.rinkeby.L2.rpcUrl]
    }

    this.provider = await web3Modal.connect();
    this.web3Provider = new Web3Provider(this.provider);
    this.web3Provider.jsonRpcFetchFunc(
      'wallet_addEthereumChain',
      [chainParam, this.account],
    );
  }

  async getTransactions() {
    //rinkeby L1
    if (this.chainID === 4) {
      const response = await fetch(`${ETHERSCAN_URL}&address=${this.account}`);
      if (response.status === 200) {
        const transactions = await response.json();
        if (transactions.status === '1') {
          return transactions.result;
        }
      }
    }
    //rinkeby L2
    if (this.chainID === 28) {
      const response = await fetch( OMGX_WATCHER_URL + 'get.transaction', 
        {
          method: 'POST',
          body: JSON.stringify({
            address: this.account,
            fromRange: 0,
            toRange: 100,
          })
        }
      );
      if (response.status === 201) {
        const transactions = await response.json();
        return transactions;
      }
    }
  }

  async getExits() {
    if (this.chainID === 28 || this.chainID === 4) {
      const response = await fetch( OMGX_WATCHER_URL + 'get.transaction', 
        {
          method: 'POST',
          body: JSON.stringify({
            address: this.account,
            fromRange: 0,
            toRange: 100,
          })
        }
      );
      if (response.status === 201) {
        const transactions = await response.json();
        const filteredTransactions = transactions.filter(i => 
          [this.L2LPAddress.toLowerCase(), this.L2DepositedERC20Address.toLowerCase(), this.l2ETHGatewayAddress.toLowerCase()]
          .includes(i.to ? i.to.toLowerCase(): null) && i.crossDomainMessage
        )
        return { exited: filteredTransactions};
      }
    }
  }

  async getBalances () {

    try {

      const rootChainBalance = await this.l1Provider.getBalance(this.account);
      const ERC20L1Balance = await this.ERC20L1Contract.methods.balances(this.account).call({from: this.account});

      const childChainBalance = await this.l2Provider.getBalance(this.account);
      const ERC20L2Balance = await this.ERC20L2Contract.methods.balanceOf(this.account).call({from: this.account});

      // //how many NFTs do I own?
      const ERC721L2Balance = await this.ERC721Contract.methods.balanceOf(this.account).call({from: this.account});
      // console.log("ERC721L2Balance",ERC721L2Balance)
      // console.log("this.account",this.account)
      // console.log(this.ERC721Contract)

      //let see if we already know about them
      const myNFTS = getNFTs()
      const numberOfNFTS = Object.keys(myNFTS).length;

      if(Number(ERC721L2Balance.toString()) !== numberOfNFTS) {

        //oh - something just changed - either got one, or sent one
        console.log("NFT change detected!")

        //we need to do something
        //get the first one

        let tokenID = null
        let nftTokenIDs = null
        let nftMeta = null
        let meta = null

        //always the same, no need to have in the loop
        let nftName = await this.ERC721Contract.methods.getName().call({from: this.account});
        let nftSymbol = await this.ERC721Contract.methods.getSymbol().call({from: this.account});

        for (var i = 0; i < Number(ERC721L2Balance.toString()); i++) {

          tokenID = BigNumber.from(i)
          nftTokenIDs = await this.ERC721Contract.methods.tokenOfOwnerByIndex(this.account, tokenID).call({from: this.account});
          nftMeta = await this.ERC721Contract.methods.getTokenURI(tokenID).call({from: this.account});
          meta = nftMeta.split("#")
          
          const time = new Date(parseInt(meta[1]));

          addNFT({
            UUID: this.ERC721Address.substring(1, 6) + "_" + nftTokenIDs.toString() +  "_" + this.account.substring(1, 6),
            owner: meta[0],
            mintedTime: String(time.toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })),
            url: meta[2],
            tokenID: tokenID,
            name: nftName,
            symbol: nftSymbol
          })
        }

      } else {
        // console.log("No NFT changes")
        //all set - do nothing
      }

      const ethToken = await getToken("0x0000000000000000000000000000000000000000");
      let testToken = null;
      
      //For testing - we always provide a test token
      if (this.L1orL2 === 'L1') {
        testToken = await getToken(this.ERC20Address);
      } else {
        testToken = await getToken(this.L2DepositedERC20Address);
      }

      const rootchainEthBalance = [
        {
          ...ethToken,
          amount: new BN(rootChainBalance.toString()),
        },
        {
          ...testToken,
          currency: this.ERC20Address,
          amount: new BN(ERC20L1Balance.toString()),
        }
      ];

      const childchainEthBalance = [
        {
          ...ethToken,
          currency: this.l2ETHGatewayAddress,
          symbol: 'oETH',
          amount: new BN(childChainBalance.toString()),
        },
        {
          ...testToken,
          currency: this.L2DepositedERC20Address,
          amount: new BN(ERC20L2Balance.toString()),
        },
      ]

      return {
        rootchain: orderBy(rootchainEthBalance, i => i.currency),
        childchain: orderBy(childchainEthBalance, i => i.currency)
      }

    } catch (error) {
      throw new WebWalletError({
        originalError: error,
        reportToSentry: false,
        reportToUi: false
      });
    }
  }

  depositETHL1 = () => async (dispatch) => {

    //for this to work, we have to be on the L1
    //otherwise makes no sense
    if (this.L1orL2 !== 'L1') return 

    try {
      //const l1ProviderRPC = new JsonRpcProvider(l1Network.rpcUrl);
      const signer = this.l1Provider.getSigner();
      
      // Send 1 ETH
      const txOption = {
        to: this.account,
        value: parseEther('1'), 
        gasPrice: parseUnits("4.1", "gwei"),
        gasLimit: hexlify(120000),
      } 

      const tx = await signer.sendTransaction(txOption);
      await tx.wait();

      console.log(tx);

      dispatch(openAlert("Deposited ETH to L1"));

    } catch (error) {
      dispatch(openError("Failed to deposit ETH to L1"));
    }
  }

  depositETHL2 = async (value='1') => {

    try {
      const depositTxStatus = await this.L1ETHGatewayContract.deposit({
        value: parseEther(value),
      });
      await depositTxStatus.wait();

      const [l1ToL2msgHash] = await this.watcher.getMessageHashesFromL1Tx(depositTxStatus.hash);
      console.log(' got L1->L2 message hash', l1ToL2msgHash);

      const l2Receipt = await this.watcher.getL2TransactionReceipt(l1ToL2msgHash);
      console.log(' completed Deposit! L2 tx hash:', l2Receipt.transactionHash);
      
      this.getBalances();

      return l2Receipt;

    } catch {
      return false;
    }
  }

  async transfer(address, value, currency) {

    if (currency === '0x4200000000000000000000000000000000000006') {
      const txStatus = await this.L2ETHGatewayContract.transfer(
        address,
        parseEther(value.toString()), 
      );
      const txRes = await txStatus.wait();
      console.log(txRes);
      return txRes;
    }
    if (currency.toLowerCase() === this.L2DepositedERC20Address.toLowerCase()) {
      const txStatus = await this.OVM_L2DepositedERC20.transfer(
        address,
        parseEther(value.toString()), 
      );
      const txRes = await txStatus.wait();
      console.log(txRes);
      return txRes;
    }
  }

  confirmLayer = (layerToConfirm) => async (dispatch) =>{
    if(layerToConfirm === this.L1orL2 ) {
      return true
    } else {
      return false
    }
  }

  async getAllTransactions () {
    let transactionHistory = {};
    const latest = await this.l2Provider.eth.getBlockNumber();
    const blockNumbers = Array.from(Array(latest).keys());
    
    for (let blockNumber of blockNumbers) {
      const blockData = await this.l2Provider.eth.getBlock(blockNumber);
      const transactionsArray = blockData.transactions;
      if (transactionsArray.length === 0) {
        transactionHistory.push({/*ToDo*/})
      }
    }
  }

  async checkAllowance (currency, targetContract=this.L1ERC20GatewayAddress) {
    try {
      const ERC20Contract = new ethers.Contract(
        currency, 
        L1ERC20Json.abi, 
        this.web3Provider.getSigner(),
      );
      const allowance = await ERC20Contract.allowance(this.account, targetContract);
      return allowance.toString();
    } catch (error) {
      throw new WebWalletError({
        originalError: error,
        customErrorMessage: 'Could not check deposit allowance for ERC20.',
        reportToSentry: false,
        reportToUi: true
      });
    }
  }

  async approveErc20 (value, currency, approveContractAddress=this.L1ERC20GatewayAddress, contractABI= L1ERC20Json.abi) {
    try {
      const ERC20Contract = new ethers.Contract(
        currency, 
        contractABI, 
        this.web3Provider.getSigner(),
      );

      const approveStatus = await ERC20Contract.approve(
        approveContractAddress,
        value,
      );
      await approveStatus.wait();

      return true;
    } catch (error) {
      return false;
    }
  }

  async resetApprove (value, currency, approveContractAddress=this.L1ERC20GatewayAddress, contractABI= L1ERC20Json.abi) {
    try {
      const ERC20Contract = new ethers.Contract(
        currency, 
        contractABI, 
        this.web3Provider.getSigner(),
      );

      const resetApproveStatus = await ERC20Contract.approve(
        approveContractAddress,
        0,
      );
      await resetApproveStatus.wait();

      const approveStatus = await ERC20Contract.approve(
        approveContractAddress,
        value,
      );
      await approveStatus.wait();
      return true;
    } catch (error) {
      throw new WebWalletError({
        originalError: error,
        customErrorMessage: 'Could not reset approval allowance for ERC20.',
        reportToSentry: false,
        reportToUi: true
      });
    }
  }

  async depositErc20 (value, currency, gasPrice) {
    try {
      const ERC20Contract = new ethers.Contract(
        currency, 
        L1ERC20Json.abi, 
        this.web3Provider.getSigner(),
      );
      const allowance = await ERC20Contract.allowance(this.account, this.L1ERC20GatewayAddress);
      
      console.log({allowance:  allowance.toString(), value});

      const depositTxStatus = await this.OVM_L1ERC20Gateway.deposit(
        value,
        {gasLimit: 1000000},
      );
      await depositTxStatus.wait();

      const [l1ToL2msgHash] = await this.watcher.getMessageHashesFromL1Tx(depositTxStatus.hash);
      console.log(' got L1->L2 message hash', l1ToL2msgHash);

      const l2Receipt = await this.watcher.getL2TransactionReceipt(l1ToL2msgHash);
      console.log(' completed Deposit! L2 tx hash:', l2Receipt.transactionHash);
      
      this.getBalances();

      return l2Receipt;
    } catch (error) {
      throw new WebWalletError({
        originalError: error,
        customErrorMessage: 'Could not deposit ERC20. Please check to make sure you have enough in your wallet to cover both the amount you want to deposit and the associated gas fees.',
        reportToSentry: false,
        reportToUi: true
      });
    }
  }

  async exitOMGX(currency, value) {
    if (currency === '0x4200000000000000000000000000000000000006') {
      const tx = await this.L2ETHGatewayContract.withdraw(
        parseEther(value.toString()), 
        {gasLimit: 5000000}, 
      );
      await tx.wait();

      const [l2ToL1msgHash] = await this.watcher.getMessageHashesFromL2Tx(tx.hash)
      console.log(' got L2->L1 message hash', l2ToL1msgHash)
      
      const l1Receipt = await this.watcher.getL1TransactionReceipt(l2ToL1msgHash)
      console.log(' completed Deposit! L1 tx hash:', l1Receipt.transactionHash)
    
      return tx
    }
    if (currency === this.L2DepositedERC20Address) {
      const tx = await this.OVM_L2DepositedERC20.withdraw(
        parseEther(value.toString()), 
        {gasLimit: 5000000}, 

      );
      await tx.wait();

      const [l2ToL1msgHash] = await this.watcher.getMessageHashesFromL2Tx(tx.hash)
      console.log(' got L2->L1 message hash', l2ToL1msgHash)
      
      const l1Receipt = await this.watcher.getL1TransactionReceipt(l2ToL1msgHash)
      console.log(' completed Deposit! L1 tx hash:', l1Receipt.transactionHash)
      
      return tx
    }
    
  }

  /***********************************************/
  /*****                  Fee                *****/
  /***********************************************/
  // Total exist fee
  async getTotalFeeRate() {
    const L2LPContract = new this.l2Web3Provider.eth.Contract(
      L2LPJson.abi,
      this.L2LPAddress,
    );
    const feeRate = await L2LPContract.methods.totalFeeRate().call({ from: this.account });
    return (feeRate / 1000 * 100).toFixed(0);
  }

  async getUserRewardFeeRate() {
    const L2LPContract = new this.l2Web3Provider.eth.Contract(
      L2LPJson.abi,
      this.L2LPAddress,
    );
    const feeRate = await L2LPContract.methods.userRewardFeeRate().call({ from: this.account });
    return (feeRate / 1000 * 100).toFixed(1);
  }
  /***********************************************/

  /***********************************************/
  /*****           Pool, User Info           *****/
  /***********************************************/
  async getPoolInfo() {
    const tokenList = [this.l2ETHGatewayAddress, this.L2DepositedERC20Address];
    const L2LPContract = new this.l2Web3Provider.eth.Contract(
      L2LPJson.abi,
      this.L2LPAddress,
    );
    const poolInfo = {};
    for (let token of tokenList) {
      const poolTokenInfo = await L2LPContract.methods.poolInfo(token).call({ from : this.account });
      poolInfo[token] = {
        l1TokenAddress: poolTokenInfo.l1TokenAddress,
        l2TokenAddress: poolTokenInfo.l2TokenAddress,
        accUserReward: poolTokenInfo.accUserReward,
        accUserRewardPerShare: poolTokenInfo.accUserRewardPerShare,
        latestUserRewardPerShare: poolTokenInfo.latestUserRewardPerShare,
        userDepositAmount: poolTokenInfo.userDepositAmount,
      }
    }
    return poolInfo
  }

  async getUserInfo() {
    const tokenList = [this.l2ETHGatewayAddress, this.L2DepositedERC20Address];
    const L2LPContract = new this.l2Web3Provider.eth.Contract(
      L2LPJson.abi,
      this.L2LPAddress,
    );
    const userInfo = {};
    for (let token of tokenList) {
      const userTokenInfo = await L2LPContract.methods.userInfo(token, this.account).call({ from : this.account });
      userInfo[token] = {
        l2TokenAddress: token,
        amount: userTokenInfo.amount,
        pendingReward: userTokenInfo.pendingReward,
        rewardDebt: userTokenInfo.rewardDebt,
      }
    }
    return userInfo
  }
  /***********************************************/
  
  /***********************************************/
  /*****            Add Liquidity            *****/
  /***********************************************/
  async addLiquidity(currency, value) {
    const decimals = 18;
    let depositAmount = powAmount(value, decimals);

    try {
      // Deposit
      const addLiquidityTX = await this.L2LPContract.addLiquidity(
        depositAmount,
        currency,
      );
      await addLiquidityTX.wait();

      // Waiting the response from L1
      const [l2ToL1msgHash] = await this.watcher.getMessageHashesFromL2Tx(addLiquidityTX.hash)
      console.log(' got L2->L1 message hash', l2ToL1msgHash)
          
      const l1Receipt = await this.watcher.getL1TransactionReceipt(l2ToL1msgHash)
      console.log(' completed Deposit! L1 tx hash:', l1Receipt.transactionHash)

      return true
    } catch (err) {
      return false
    }
  }
  /***********************************************/

  /***********************************************/
  /*****              Get Reward             *****/
  /***********************************************/
  async getReward(currency, value) {
    try {
      // Deposit
      const withdrawRewardTX = await this.L2LPContract.withdrawReward(
        value,
        currency,
        this.account
      );
      await withdrawRewardTX.wait();

      return true
    } catch (err) {
      return false
    }
  }
  /***********************************************/

  /***********************************************/
  /*****          Withdraw Liquidity         *****/
  /***********************************************/
  async withdrawLiquidity(currency, value) {
    const decimals = 18;
    let withdrawAmount = powAmount(value, decimals);
    try {
      // Deposit
      const withdrawLiquidityTX = await this.L2LPContract.withdrawLiqudity(
        withdrawAmount,
        currency,
        this.account
      );
      await withdrawLiquidityTX.wait();

      return true
    } catch (err) {
      return false
    }
  }
  /***********************************************/

  async depositL1LP(currency, value) {
    const decimals = 18;
    let depositAmount = powAmount(value, decimals);
    depositAmount = new BN(depositAmount);

    if (currency.toLowerCase() === this.ERC20Address.toLowerCase()) {
      const ERC20Contract = new ethers.Contract(
        currency, 
        L1ERC20Json.abi, 
        this.web3Provider.getSigner(),
      );
      
      // Check if the allowance is large enough
      let allowance = await ERC20Contract.allowance(this.account, this.L1LPAddress);
      allowance = new BN(allowance.toString());

      if (depositAmount.gt(allowance)) {
        const approveStatus = await ERC20Contract.approve(
          this.L1LPAddress,
          depositAmount.toString(),
        );
        await approveStatus.wait();
      }

      const depositTX = await this.L1LPContract.clientDepositL1(
        depositAmount.toString(),
        currency
      );
      await depositTX.wait();

      // Waiting the response from L2
      const [l1ToL2msgHash] = await this.watcher.getMessageHashesFromL1Tx(depositTX.hash)
      console.log(' got L1->L2 message hash', l1ToL2msgHash)
      const l2Receipt = await this.watcher.getL2TransactionReceipt(l1ToL2msgHash)
      console.log(' completed Deposit! L2 tx hash:', l2Receipt.transactionHash)

      return l2Receipt
    } else {
      const web3 = new Web3(this.provider);
      const depositTX = await web3.eth.sendTransaction({
        from: this.account,
        to: this.L1LPAddress,
        value: depositAmount,
      })

      const [l1ToL2msgHash] = await this.watcher.getMessageHashesFromL1Tx(depositTX.transactionHash)
      console.log(' got L1->L2 message hash', l1ToL2msgHash)
      const l2Receipt = await this.watcher.getL2TransactionReceipt(l1ToL2msgHash)
      console.log(' completed Deposit! L2 tx hash:', l2Receipt.transactionHash)

      return l2Receipt
    }

  }

  async L1LPBalance(currency) {
    let balance;
    if (currency === this.l2ETHGatewayAddress) {
      balance = await this.l1Provider.getBalance(this.L1LPAddress);
    }
    if (currency === this.L2DepositedERC20Address) {
      balance = await this.ERC20L1Contract.methods.balances(this.L1LPAddress).call({from: this.account});
    }
    const decimals = 18;
    return logAmount(balance.toString(), decimals);
  }

  async depositL2LP(currency, value) {
    const ERC20Contract = new ethers.Contract(
      currency, 
      L2DepositedERC20Json.abi, 
      this.web3Provider.getSigner(),
    );

    let allowance = await ERC20Contract.allowance(this.account, this.L2LPAddress);
    allowance = new BN(allowance.toString());

    const token = await getToken(currency);
    const decimals = token.decimals;
    let depositAmount = powAmount(value, decimals);
    depositAmount = new BN(depositAmount);

    if (depositAmount.gt(allowance)) {
      const approveStatus = await ERC20Contract.approve(
        this.L2LPAddress,
        depositAmount.toString(),
      );
      await approveStatus.wait();
    }

    const depositTX = await this.L2LPContract.clientDepositL2(
      depositAmount.toString(),
      currency,
    );

    await depositTX.wait();

    // Waiting the response from L1
    const [l2ToL1msgHash] = await this.watcher.getMessageHashesFromL2Tx(depositTX.hash)
    console.log(' got L2->L1 message hash', l2ToL1msgHash)
    
    const l1Receipt = await this.watcher.getL1TransactionReceipt(l2ToL1msgHash)
    console.log(' completed Deposit! L1 tx hash:', l1Receipt.transactionHash)

    return l1Receipt
  }

  async L2LPBalance(currency) {
    let balance;
    if (currency === '0x0000000000000000000000000000000000000000') {
      const L2ETHGateway = new this.l2Web3Provider.eth.Contract(
        L2DepositedERC20Json.abi,
        this.l2ETHGatewayAddress,
      );
      balance = await L2ETHGateway.methods.balanceOf(this.L2LPAddress).call({from: this.account});
    } else if (currency.toLowerCase() === this.ERC20Address.toLowerCase()) {
      balance = await this.ERC20L2Contract.methods.balanceOf(this.L2LPAddress).call({from: this.account});
    } else {
      const L2ERC20 = new this.l2Web3Provider.eth.Contract(
        L2DepositedERC20Json.abi,
        currency,
      );
      balance = await L2ERC20.methods.balanceOf(this.L2LPAddress).call({from: this.account});
    }
    const decimals = 18;
    return logAmount(balance.toString(), decimals);
  }

  async getTestToken() {
    try {
      const getTokenTX = await this.L2TokenPoolContract.requestToken();
      await getTokenTX.wait();
      return true;
    }catch {
      return false;
    }
  }

}

const networkService = new NetworkService();
export default networkService;