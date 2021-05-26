/*
  Utility Functions for OMG Plasma 
  Copyright (C) 2021 Enya Inc. Palo Alto, CA

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React from 'react';
import { connect } from 'react-redux';
import { isEqual } from 'lodash';

import { 
  getFarmInfo,
  getFee,
} from 'actions/farmAction';

import FarmList from 'components/farmList/FarmList';

import networkService from 'services/networkService';

import ethLogo from 'images/ethereum.svg';
import JLKNLogo from 'images/JLKN.svg';

import * as styles from './Farm.module.scss';

class Farm extends React.Component {
  constructor(props) {
    super(props);

    const { 
      totalFeeRate, userRewardFeeRate,
      poolInfo, userInfo,
    } = this.props.farm;

    this.state = {
      totalFeeRate, userRewardFeeRate,
      poolInfo, userInfo,
    }
  }

  componentDidMount() {
    const { totalFeeRate, userRewardFeeRate } = this.props.farm;
    if (!totalFeeRate || !userRewardFeeRate) {
      this.props.dispatch(getFee());
    }
    this.props.dispatch(getFarmInfo());
  }

  componentDidUpdate(prevState) {
    const { 
      totalFeeRate, userRewardFeeRate,
      poolInfo, userInfo,
    } = this.props.farm;

    if (prevState.farm.totalFeeRate !== totalFeeRate) {
      this.setState({ totalFeeRate });
    }

    if (prevState.farm.userRewardFeeRate !== userRewardFeeRate) {
      this.setState({ userRewardFeeRate });
    }

    if (!isEqual(prevState.farm.poolInfo, poolInfo)) {
      this.setState({ poolInfo });
    }

    if (!isEqual(prevState.farm.userInfo, userInfo)) {
      this.setState({ userInfo });
    }
  }

  render() {
    const { 
      // Fee
      totalFeeRate, userRewardFeeRate,
      // Pool
      poolInfo,
      // user
      userInfo,
    } = this.state;

    return (
      <div className={styles.Farm}>
        <h2>Stake tokens to the liquidity pool to earn</h2>
        <div className={styles.Note}>
          Your tokens will be deposited into the liquidity pool. 
          Meanwhile, you are rewarded with a portion of the fees collected from the swap users.
        </div>
        <div className={styles.Note}>
          The current reward rate is {userRewardFeeRate}%. 
          Whenever someone fast exists, the user pays a {totalFeeRate}% fee, 
          of which {userRewardFeeRate}% is added to the liquidity pool of the token they used. 
        </div>
        <div className={styles.TableContainer}>
          {Object.keys(poolInfo).map((v, i) => {
            return (
              <FarmList 
                key={i}
                logo={v === networkService.l2ETHGatewayAddress ? ethLogo : JLKNLogo}
                name={v === networkService.l2ETHGatewayAddress ? "Ethereum" : "JLKN"}
                shortName={v === networkService.l2ETHGatewayAddress ? "ETH" : "JLKN"}
                poolInfo={poolInfo[v]}
                userInfo={userInfo[v]}
                disabled={networkService.L1orL2 === 'L1'}
              />
            )
          })}
        </div>
      </div>
    )
  }
}

const mapStateToProps = state => ({ 
  farm: state.farm
});

export default connect(mapStateToProps)(Farm);