import { injectL2Context } from 'omgx_core-utils'
import { getContractFactory, getContractInterface } from 'omgx_contracts'
import {
  Contract,
  Wallet,
  constants,
  providers,
  BigNumber,
} from 'ethers'
require('dotenv').config()

export const GWEI = BigNumber.from(0)

// The hardhat instance
//const l1HttpPort = 9545
export const l1Provider = new providers.JsonRpcProvider(process.env.L1_NODE_WEB3_URL)
export const l2Provider = new providers.JsonRpcProvider(process.env.L2_NODE_WEB3_URL)
// export const l2Provider = injectL2Context(l2P)

// An account for testing which is funded on L1
export const bobl1Wallet = new Wallet(process.env.TEST_PRIVATE_KEY_1,l1Provider)
export const bobl2Wallet = bobl1Wallet.connect(l2Provider)

// The second test user with some eth
export const alicel1Wallet = new Wallet(process.env.TEST_PRIVATE_KEY_2).connect(l1Provider)
export const alicel2Wallet = new Wallet(process.env.TEST_PRIVATE_KEY_2).connect(l2Provider)

// The third test user with some eth
export const katel1Wallet = new Wallet(process.env.TEST_PRIVATE_KEY_3).connect(l1Provider)
export const katel2Wallet = new Wallet(process.env.TEST_PRIVATE_KEY_3).connect(l2Provider)

// Predeploys
export const PROXY_SEQUENCER_ENTRYPOINT_ADDRESS = '0x4200000000000000000000000000000000000004'
export const OVM_ETH_ADDRESS = '0x4200000000000000000000000000000000000006'
export const Proxy__OVM_L2CrossDomainMessenger = '0x4200000000000000000000000000000000000007'
export const addressManagerAddress = process.env.ETH1_ADDRESS_RESOLVER_ADDRESS

export const getAddressManager = (provider: any) => {
  return getContractFactory('Lib_AddressManager')
    .connect(provider)
    .attach(addressManagerAddress) as any
}

// Gets the gateway using the proxy if available
export const getL1ETHGateway = async (wallet: Wallet, AddressManager: Contract) => {
  
  const l1GatewayInterface = getContractInterface('OVM_L1ETHGateway')
  const ProxyGatewayAddress = await AddressManager.getAddress('Proxy__OVM_L1ETHGateway')
  
  const L1ETHGateway = new Contract(
    ProxyGatewayAddress,
    l1GatewayInterface as any,
    wallet
  )

  return L1ETHGateway
}

export const getL2ETHGateway = (wallet: Wallet) => {
  const OVM_ETH = new Contract(
    OVM_ETH_ADDRESS,
    getContractInterface('OVM_ETH') as any,
    wallet
  )
  return OVM_ETH
}


export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
