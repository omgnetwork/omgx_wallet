import React from 'react';
import { connect } from 'react-redux';
import { isEqual } from 'lodash';

import { closeModal, openAlert, openError } from 'actions/uiAction';
import { getFarmInfo } from 'actions/farmAction';

import Button from 'components/button/Button';
import Modal from 'components/modal/Modal';
import InputSelect from 'components/inputselect/InputSelect';
import { logAmount } from 'util/amountConvert';

import networkService from 'services/networkService';

import * as styles from './Farm.module.scss';

class FarmWithdrawModal extends React.Component {
  constructor(props) {
    super(props);

    const { open, balance } = this.props;
    const { withdrawToken, userInfo } = this.props.farm;

    this.state = {
      open,
      withdrawToken,
      withdrawValue: '',
      // balance
      userInfo,
      childchainBalance: balance.childchain,
      L2LPBalance: 0,
      // loading 
      loading: false,
    }
  }

  async componentDidUpdate(prevState) {
    const { open, balance } = this.props;
    const { withdrawToken, userInfo } = this.props.farm;

    if (prevState.open !== open) {
      this.setState({ open });
    }

    if (!isEqual(prevState.farm.withdrawToken, withdrawToken)) {
      const L2LPBalance = await networkService.L2LPBalance(withdrawToken.currency);
      console.log({ L2LPBalance });
      this.setState({ withdrawToken, L2LPBalance });
    }

    if (!isEqual(prevState.farm.userInfo, userInfo)) {
      this.setState({ userInfo });
    }

    if (!isEqual(prevState.balance, balance)) {
      this.setState({ childchainBalance: balance.childchain });
    }
  }

  getMaxTransferValue () {
    const { userInfo, withdrawToken } = this.state;
    let transferingBalance = 0
    if (userInfo[withdrawToken.currency]) {
      transferingBalance = userInfo[withdrawToken.currency].amount
    }
    return logAmount(transferingBalance, 18);
  }

  handleClose() {
    this.props.dispatch(closeModal("farmWithdrawModal"));
  }

  async handleConfirm() {
    const { withdrawToken, withdrawValue } = this.state;
    
    this.setState({ loading: true });

    const withdrawLiquidityTX = await networkService.withdrawLiquidity(
      withdrawToken.currency,
      withdrawValue,
    );
    if (withdrawLiquidityTX) {
      this.props.dispatch(openAlert("Your liquidity was withdrawn."));
      this.props.dispatch(getFarmInfo());
      this.setState({ loading: false });
      this.props.dispatch(closeModal("farmWithdrawModal"));
    } else {
      this.props.dispatch(openError("Failed to withdraw liquidity."));
      this.setState({ loading: false });
    }
  }

  render() {
    const { 
      open, 
      withdrawToken, withdrawValue,
      userInfo, childchainBalance, L2LPBalance,
      loading,
    } = this.state;

    const selectOptions = childchainBalance.reduce((acc, cur) => {
      if (cur.currency.toLowerCase() === withdrawToken.currency.toLowerCase()) {
        acc.push({
          title: cur.symbol,
          value: cur.currency,
          subTitle: `Balance: ${logAmount(userInfo[withdrawToken.currency].amount, cur.decimals)}`
        })
      }
      return acc;
    }, []);

    return (
      <Modal open={open}>
        <h2>Withdraw {`${withdrawToken.symbol}`}</h2>

        <InputSelect
          label='Amount to withdraw'
          placeholder={0}
          value={withdrawValue}
          onChange={i => {
            this.setState({withdrawValue: i.target.value});
          }}
          onSelect={i => {}}
          selectOptions={selectOptions}
          selectValue={withdrawToken.currency}
          maxValue={this.getMaxTransferValue()}
          disabledSelect={true}
        />

        {Number(withdrawValue) > Number(this.getMaxTransferValue()) && 
          <div className={styles.disclaimer}>
            You don't have enough {withdrawToken.symbol} to withdraw.
          </div>
        }
        {Number(withdrawValue) > Number(L2LPBalance) && 
          <div className={styles.disclaimer}>
            We don't have enough {withdrawToken.symbol} on L2. Please contact us.
          </div>
        }
        
        <div className={styles.buttons}>
          <Button
            onClick={()=>{this.handleClose()}}
            type='outline'
            className={styles.button}
          >
            CANCEL
          </Button>
          <Button
            onClick={()=>{this.handleConfirm()}}
            type='primary'
            className={styles.button}
            disabled={
              Number(this.getMaxTransferValue()) < Number(withdrawValue) || 
              Number(withdrawValue) > Number(L2LPBalance) ||
              withdrawValue === '' || 
              !withdrawValue 
            }
            loading={loading}
          >
            CONFIRM
          </Button>
        </div> 


      </Modal>
    )
  }
}

const mapStateToProps = state => ({
  ui: state.ui,
  farm: state.farm,
  balance: state.balance,
});

export default connect(mapStateToProps)(FarmWithdrawModal);