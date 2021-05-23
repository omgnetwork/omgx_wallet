// SPDX-License-Identifier: MIT
// @unsupported: ovm
pragma solidity >0.5.0;
pragma experimental ABIEncoderV2;

import "./interfaces/iL2LiquidityPool.sol";

/* Library Imports */
import "omgx_contracts/build/contracts/libraries/bridge/OVM_CrossDomainEnabled.sol";

/* External Imports */
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @dev An L1 LiquidityPool implementation
 */
contract L1LiquidityPool is OVM_CrossDomainEnabled, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 constant internal SAFE_GAS_STIPEND = 2300;

    /*************
     * Variables *
     *************/
     
    // this is to stop attacks where caller specifies l2contractaddress
    // also acts as a whitelist
    mapping(address => address) l2ContractAddress;
    
    address l2LiquidityPoolAddress;

    /********************
     *    Constructor   *
     ********************/
    constructor(
        address _l2LiquidityPoolAddress,
        address _l1messenger,
        address _l2ETHAddress
    )
        OVM_CrossDomainEnabled(_l1messenger)
    {
        l2LiquidityPoolAddress = _l2LiquidityPoolAddress;
        l2ContractAddress[address(0)] = _l2ETHAddress;
    }

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

    /********************
     * Public Functions *
     ********************/

    // Default gas value which can be overridden if more complex logic runs on L2.
    uint32 public DEFAULT_FINALIZE_DEPOSIT_L2_GAS = 1200000;

    function registerTokenAddress(
        address _l1TokenAddress,
        address _l2TokenAddress
    )
        public
        onlyOwner()
    {
        // use with caution, can register only once
        require(l2ContractAddress[_l1TokenAddress] == address(0), "Token Address Already Registerd");
        l2ContractAddress[_l1TokenAddress] = _l2TokenAddress;
    } 

    /**
     * @dev Receive ETH
     */
    receive() external payable {

        // Construct calldata for L2LiquidityPool.depositToFinalize(_to, _amount)
        bytes memory data = abi.encodeWithSelector(
            iL2LiquidityPool.clientPayL2.selector,
            msg.sender,
            msg.value,
            l2ContractAddress[address(0)]
        );

        // Send calldata into L2
        sendCrossDomainMessage(
            l2LiquidityPoolAddress,
            data,
            getFinalizeDepositL2Gas()
        );

        emit clientDepositL1_EVENT(
            msg.sender,
            msg.value,
            address(0),
            l2ContractAddress[address(0)]
        );

    }

    /**
     * @dev Overridable getter for the L2 gas limit, in the case it may be
     * dynamic, and the above public constant does not suffice.
     *
     */
    function getFinalizeDepositL2Gas()
        internal
        view
        returns(
            uint32
        )
    {
        return DEFAULT_FINALIZE_DEPOSIT_L2_GAS;
    }

    /**
     * Client deposit ERC20 from their account to this contract, which then releases funds on the L2 side
     * @param _amount Amount to transfer to the other account.
     * @param _tokenAddress ERC20 L1 token address.
     */
    function clientDepositL1(
        uint256 _amount,
        address _tokenAddress
    )
        external
    {   
        require(l2ContractAddress[_tokenAddress] != address(0), "Token L2 address not registered");

        require(IERC20(_tokenAddress).transferFrom(msg.sender, address(this), _amount));

        // Construct calldata for L2LiquidityPool.depositToFinalize(_to, _receivedAmount)
        bytes memory data = abi.encodeWithSelector(
            iL2LiquidityPool.clientPayL2.selector,
            msg.sender,
            _amount,
            l2ContractAddress[_tokenAddress]
        );

        // Send calldata into L2
        sendCrossDomainMessage(
            l2LiquidityPoolAddress,
            data,
            getFinalizeDepositL2Gas()
        );

        emit clientDepositL1_EVENT(
            msg.sender,
            _amount,
            _tokenAddress,
            l2ContractAddress[_tokenAddress]
        );

    }

    /*************************
     * Cross-chain Functions *
     *************************/

    /**
     * Move funds from L2 to L1, and pay out from the right liquidity pool
     * @param _to Address that will receive the funds.
     * @param _amount amount to be transferred.
     * @param _tokenAddress L1 erc20 token.
     */
    function clientPayL1(
        address payable _to,
        uint256 _amount,
        address _tokenAddress
    )
        external
        onlyFromCrossDomainAccount(address(l2LiquidityPoolAddress))
    {   
        if (_tokenAddress != address(0)) {
            IERC20(_tokenAddress).safeTransfer(_to, _amount);
        } else {
            //this is ETH
            // balances[address(0)] = balances[address(0)].sub(_amount);
            //_to.transfer(_amount); UNSAFE
            (bool sent,) = _to.call{gas: SAFE_GAS_STIPEND, value: _amount}("");
            require(sent, "Failed to send Ether");
        }
        
        emit clientPayL1_EVENT(
          _to,
          _amount,
          _tokenAddress,
          l2ContractAddress[_tokenAddress]
        );
    }
}
