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

import networkService from 'services/networkService';

const initialState = {
  totalFeeRate: 0,
  userRewardFeeRate: 0,
  poolInfo: {
    [networkService.l2ETHGatewayAddress]: {},
  },
  userInfo: {
    [networkService.l2ETHGatewayAddress]: {},
  },
  stakeToken: {
    symbol: "ETH",
    currency: networkService.l2ETHGatewayAddress,
  },
  withdrawToken: {
    symbol: "ETH",
    currency: networkService.l2ETHGatewayAddress,
  }
};

function farmReducer (state = initialState, action) {
  switch (action.type) {
    case 'GET_FARMINFO':
      return state;
    case 'GET_FARMINFO_SUCCESS':
      return {
        ...state,
        poolInfo: action.payload.poolInfo,
        userInfo: action.payload.userInfo,
      }
    case 'GET_FEE':
      return state;
    case 'GET_FEE_SUCCESS':
      return { 
        ...state, 
        userRewardFeeRate: action.payload.userRewardFeeRate,
        totalFeeRate: action.payload.totalFeeRate,
      }
    case 'UPDATE_STAKE_TOKEN':
      return {
        ...state,
        stakeToken: action.payload,
      }
    case 'UPDATE_WITHDRAW_TOKEN':
      return {
        ...state,
        withdrawToken: action.payload,
      }
    default:
      return state;
  }
}

export default farmReducer;
