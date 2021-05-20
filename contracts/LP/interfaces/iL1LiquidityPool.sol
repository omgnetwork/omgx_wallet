// SPDX-License-Identifier: MIT
pragma solidity >0.5.0;
pragma experimental ABIEncoderV2;

/**
 * @title iL1LiquidityPool
 */
interface iL1LiquidityPool {

    /********************
     *       Events     *
     ********************/

    event clientDepositL1_EVENT(
        address sender,
        uint256 amount,
        address l1TokenAddress,
        address l2TokenAddress
    );

    event clientPayL1_EVENT(
        address sender,
        uint256 amount,
        address l1TokenAddress,
        address l2TokenAddress
    );

    /*************************
     * Cross-chain Functions *
     *************************/

    function clientPayL1(
        address payable _to,
        uint256 _amount,
        address _tokenAddress
    )
        external;
}
