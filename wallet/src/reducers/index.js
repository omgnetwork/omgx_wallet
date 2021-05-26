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

import { combineReducers } from 'redux';

import loadingReducer from './loadingReducer';
import depositReducer from './depositReducer';
import transactionReducer from './transactionReducer';
import statusReducer from './statusReducer';
import balanceReducer from './balanceReducer';
import exitReducer from './exitReducer';
import queueReducer from './queueReducer';
import tokenReducer from './tokenReducer';
import nftReducer from './nftReducer';
import feeReducer from './feeReducer';
import gasReducer from './gasReducer';
import uiReducer from './uiReducer';
import setupReducer from './setupReducer';
import sellReducer from './sellReducer';
import buyReducer from './buyReducer';
import buyTaskReducer from './buyTaskReducer';
import sellTaskReducer from './sellTaskReducer';
import loginReducer from './loginReducer';
import swapReducer from './swapReducer';
import priceTickerReducer from './priceTickerReducer';
import notificationReducer from './notificationReducer';
import farmReduer from './farmReducer';

const rootReducer = combineReducers({
  loading: loadingReducer,
  deposit: depositReducer,
  transaction: transactionReducer,
  status: statusReducer,
  balance: balanceReducer,
  exit: exitReducer,
  queue: queueReducer,
  tokenList: tokenReducer,
  nftList: nftReducer,
  fees: feeReducer,
  gas: gasReducer,
  ui: uiReducer,
  setup: setupReducer,
  sell: sellReducer,
  sellTask: sellTaskReducer,
  buy: buyReducer,
  buyTask: buyTaskReducer,
  login: loginReducer,
  swap: swapReducer,
  priceTicker: priceTickerReducer,
  notification: notificationReducer,
  farm: farmReduer,
});

export default rootReducer;
