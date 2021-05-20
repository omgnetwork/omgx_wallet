// SPDX-License-Identifier: MIT
pragma solidity >0.5.0;

import "./interfaces/iL1LiquidityPool.sol";

/* Library Imports */
import "omgx_contracts/build/contracts/libraries/bridge/OVM_CrossDomainEnabled.sol";
import "omgx_contracts/build/contracts/OVM/bridge/tokens/OVM_L2DepositedERC20.sol";

/* External Imports */
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @dev An L2 LiquidityPool implementation
 */

contract L2LiquidityPool is OVM_CrossDomainEnabled, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /**************
     *   Struct   *
     **************/

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of rewards
        // entitled to a user but is pending to be distributed is:
        //   
        //   Per Share:    
        //   totalProviderDeposit = (L1Balance + L2Balance) - (pool.accUserReward + pool.accOwnerReward)
        //   userRewardPerShare = pool.accUserReward / totalProviderDeposit
        //   
        //   Updated reward:
        //   reward = user.amount * userRewardPerShare
        //     
        //   if (reward => user.rewardDebt): pending reward = (user.amount * userRewardPerShare) - user.rewardDebt
        //   Case reward < user.rewardDebet
        //   /**********************
        //   A deposit 100 and get 10 reward
        //   B deposit 10, rewardDebet = 10 * (10 /(110 - 10)) = 1
        //   A withdraw the funds, the pool only has 10
        //   B withdraw the funds userRewardPerShare = 0 / (10) = 0, reward = 0 * 10 = 0, reward < user.rewarDebet (1)
        //   ************************/
        //   else: pending reward = 0
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accRewardPerShare` gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each pool.
    struct PoolInfo {
        address l1TokenAddress; // Address of token contract.
        address l2TokenAddress; // Address of toekn contract.
        uint256 L1Balance; // L1 token balance.
        uint256 accUserReward; // Accumulated user reward.
        uint256 accOwnerReward; // Accumulated owner reward.
    }

    /*************
     * Variables *
     *************/

    // mapping L2 token address to poolInfo
    mapping(address => PoolInfo) public poolInfo;
    // Info of each user that stakes tokens.
    mapping(address => mapping(address => UserInfo)) public userInfo;

    address L1LiquidityPoolAddress;
    uint256 totalFeeRate;
    uint256 userRewardFeeRate;
    uint256 ownerRewardFeeRate;

    /********************************
     * Constructor & Initialization *
     ********************************/

    /**
     * @param _l2CrossDomainMessenger L1 Messenger address being used for cross-chain communications.
     */
    constructor (
        address _l2CrossDomainMessenger
    )
        OVM_CrossDomainEnabled(_l2CrossDomainMessenger)
    {}

    /********************
     *       Event      *
     ********************/
    
    event addLiquidity_EVENT(
        address sender,
        uint256 amount,
        address tokenAddress
    );

    event ownerRecoverFee_EVENT(
        address sender,
        address receiver,
        address tokenAddress,
        uint256 amount
    );

    event clientDepositL2_EVENT(
        address sender,
        uint256 receivedAmount,
        uint256 userRewardFee,
        uint256 ownerRewardFee,
        uint256 totalFee,
        address tokenAddress
    );

    event clientPayL2_EVENT(
        address sender,
        uint256 receivedAmount,
        uint256 userRewardFee,
        uint256 ownerRewardFee,
        uint256 totalFee,
        address tokenAddress
    );

    event withdrawLiqudiity_EVENT(
        address sender,
        address receiver,
        uint256 pendingAmount,
        uint256 requestAmount,
        uint256 withdrawAmount,
        address tokenAddress
    );

    /**********************
     * Function Modifiers *
     **********************/

    modifier onlyInitialized() {
        require(address(L1LiquidityPoolAddress) != address(0), "Contract has not yet been initialized");
        _;
    }

    /********************
     * Public Functions *
     ********************/

    // Default gas value which can be overridden if more complex logic runs on L2.
    uint32 constant DEFAULT_FINALIZE_DEPOSIT_L2_GAS = 1200000;

    /**
     * @dev Initialize this contract with the L1 token gateway address.
     * The flow: 1) this contract gets deployed on L2, 2) the L1
     * gateway is deployed with addr from (1), 3) L1 gateway address passed here.
     *
     * @param _userRewardFeeRate fee rate that users get
     * @param _ownerRewardFeeRate fee rate that contract owner gets
     * @param _L1LiquidityPoolAddress Address of the corresponding L1 gateway deployed to the main chain
     */
    function init(
        uint256 _userRewardFeeRate,
        uint256 _ownerRewardFeeRate,
        address _L1LiquidityPoolAddress
    )
        public
        onlyOwner()
    {
        totalFeeRate = _userRewardFeeRate + _ownerRewardFeeRate;
        userRewardFeeRate = _userRewardFeeRate;
        ownerRewardFeeRate = _ownerRewardFeeRate;
        L1LiquidityPoolAddress = _L1LiquidityPoolAddress;
    }

    /***
     * @dev Add the new token to the poll
     * DO NOT add the same LP token more than once. Rewards will be messed up if you do.
     * 
     * @param _l1TokenAddress
     * @param _l2TokenAddress
     *
     */
    function registerPool (
        address _l1TokenAddress,
        address _l2TokenAddress
    )
        public
        onlyOwner()
    {
        // use with caution, can register only once
        PoolInfo storage pool = poolInfo[_l2TokenAddress];
        // both l2 token address equal to zero, then pair is not registered.
        require(pool.l2TokenAddress == address(0), "Token Address Already Registerd");
        poolInfo[_l2TokenAddress] =
            PoolInfo({
                l1TokenAddress: _l1TokenAddress,
                l2TokenAddress: _l2TokenAddress,
                L1Balance: 0,
                accUserReward: 0,
                accOwnerReward: 0
            });
    } 

    /**
     * @dev Overridable getter for the *L2* gas limit of settling the deposit, in the case it may be
     * dynamic, and the above public constant does not suffice.
     *
     */
    function getFinalizeDepositL2Gas()
        public
        view
        virtual
        returns(
            uint32
        )
    {
        return DEFAULT_FINALIZE_DEPOSIT_L2_GAS;
    }

    /**
     * Get the fee rate
     */
    function getFeeRate()
        external
        view
        returns(
            uint256,
            uint256,
            uint256
        )
    {
        return (
            totalFeeRate,
            userRewardFeeRate,
            ownerRewardFeeRate
        );
    }

    /**
     * Checks the owner fee balance of an address.
     * @param _tokenAddress Address of ERC20.
     * @return Balance of the address.
     */
    function ownerFeeBalanceOf(
        address _tokenAddress
    )
        external
        view
        returns (
            uint256
        )
    {   
        PoolInfo memory pool = poolInfo[_tokenAddress];
        return pool.accOwnerReward;
    }

    /**
     * Checks the user fee balance of an address.
     * @param _tokenAddress Address of ERC20.
     * @return Balance of the address.
     */
    function userFeeBalanceOf(
        address _tokenAddress
    )
        external
        view
        returns (
            uint256
        )
    {   
        PoolInfo memory pool = poolInfo[_tokenAddress];
        return pool.accUserReward;
    }

    /**
     * Update L1 Balance
     * @param _tokenAddress Address of ERC20.
     * @param _amount L1 balance
     */
    function updateL1Balance(
        address _tokenAddress,
        uint256 _amount
    ) 
        external
        onlyOwner()
    {
        PoolInfo storage pool = poolInfo[_tokenAddress];
        pool.L1Balance = _amount;
    }

    /**
     * Gets the user reward per share
     * @param _tokenAddress Address of ERC20.
     * @return user reward per share
     */
    function getUserRewardPerShare(
        address _tokenAddress
    )   
        public
        view
        returns (
            uint256
        )
    {
        PoolInfo storage pool = poolInfo[_tokenAddress];
        uint256 userRewardPerShare = 0;
        uint256 totalBalance = IERC20(_tokenAddress).balanceOf(address(this)).add(pool.L1Balance);
        if (totalBalance >= pool.accOwnerReward.add(pool.accUserReward)) {
            uint256 userTotalDeposit = totalBalance.sub(pool.accOwnerReward).sub(pool.accUserReward);
            userRewardPerShare = pool.accUserReward.mul(1e12).div(userTotalDeposit);
        }
        return userRewardPerShare;
    }

    /**
     * Add ERC20 to pool
     * @param _amount Amount to transfer to the other account.
     * @param _tokenAddress ERC20 L2 token address.
     */
     function addLiquidity(
        uint256 _amount,
        address _tokenAddress
    ) 
        external
    {   
        PoolInfo storage pool = poolInfo[_tokenAddress];
        UserInfo storage user = userInfo[_tokenAddress][msg.sender];
        
        require(pool.l2TokenAddress != address(0), "Token Address Not Register");
        
        uint256 userRewardPerShare;
        // if the user has already deposited token, we send rewards first.
        if (user.amount > 0) {
            userRewardPerShare = getUserRewardPerShare(_tokenAddress);
            uint256 pendingAmount = 0;
            uint256 updatedRewardShare = user.amount.mul(userRewardPerShare).div(1e12);
            if (updatedRewardShare > user.rewardDebt) {
                pendingAmount = updatedRewardShare.sub(user.rewardDebt);
            }

            if (pendingAmount != 0) {
                IERC20(_tokenAddress).safeTransferFrom(address(this), msg.sender, pendingAmount);
            }
        }

        IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);
        user.amount = user.amount.add(_amount);

        userRewardPerShare = getUserRewardPerShare(_tokenAddress);
        user.rewardDebt = user.amount.mul(userRewardPerShare).div(1e12);
        
        // Transfer 1/2 funds to L1
        uint256 transferAmount = _amount.mul(1).div(2);
        // needs to allow L2 pool to transfer funds immediately
        OVM_L2DepositedERC20(_tokenAddress).withdraw(transferAmount);
        
        pool.L1Balance = pool.L1Balance.add(transferAmount);

        emit addLiquidity_EVENT(
            msg.sender,
            _amount,
            _tokenAddress
        );
    }

    /**
     * Client deposit ERC20 from their account to this contract, which then releases funds on the L1 side
     * @param _amount Amount to transfer to the other account.
     * @param _tokenAddress ERC20 token address
     */
    function clientDepositL2(
        uint256 _amount,
        address _tokenAddress
    )
        external
    {   
        PoolInfo storage pool = poolInfo[_tokenAddress];

        require(pool.l2TokenAddress != address(0), "Token Address Not Register");

        //Augment the pool size for this ERC20
        uint256 userRewardFee = (_amount.mul(userRewardFeeRate)).div(1000);
        uint256 ownerRewardFee = (_amount.mul(ownerRewardFeeRate)).div(1000);
        uint256 totalFee = userRewardFee.add(ownerRewardFee);
        uint256 receivedAmount = _amount.sub(totalFee);

        require(receivedAmount <= pool.L1Balance, "L1 Insufficient Fund");

        IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);

        pool.L1Balance = pool.L1Balance.sub(receivedAmount);
        pool.accUserReward = pool.accUserReward.add(userRewardFee);
        pool.accOwnerReward = pool.accOwnerReward.add(ownerRewardFee);

        // Construct calldata for L1LiquidityPool.depositToFinalize(_to, receivedAmount)
        bytes memory data = abi.encodeWithSelector(
            iL1LiquidityPool.clientPayL1.selector,
            msg.sender,
            receivedAmount,
            pool.l1TokenAddress
        );

        // Send calldata into L1
        sendCrossDomainMessage(
            address(L1LiquidityPoolAddress),
            data,
            getFinalizeDepositL2Gas()
        );

        emit clientDepositL2_EVENT(
            msg.sender,
            receivedAmount,
            userRewardFee,
            ownerRewardFee,
            totalFee,
            _tokenAddress
        );

    }

    /**
     * Users withdraw token from LP
     * @param _amount amount to withdraw
     * @param _tokenAddress L2 token address
     * @param _to the address that users withdraw to
     */
    function withdrawLiqudity(
        uint256 _amount,
        address _tokenAddress,
        address payable _to
    )
        external
    {   
        PoolInfo storage pool = poolInfo[_tokenAddress];
        UserInfo storage user = userInfo[_tokenAddress][msg.sender];

        require(pool.l2TokenAddress != address(0), "Token Address Not Register");
        require(user.amount >= _amount, "Withdraw Error");

        uint256 userRewardPerShare = getUserRewardPerShare(_tokenAddress);
        uint256 pendingAmount = 0;
        uint256 updatedRewardShare = user.amount.mul(userRewardPerShare).div(1e12);
        if (updatedRewardShare > user.rewardDebt) {
            pendingAmount = updatedRewardShare.sub(user.rewardDebt);
        }
        uint256 withdrawAmount = pendingAmount.add(_amount);

        // Update the user data
        user.amount = user.amount.sub(_amount);
        // Update the pool data
        pool.accUserReward = pool.accUserReward.sub(pendingAmount);
        // calculate the new reward debt
        userRewardPerShare = getUserRewardPerShare(_tokenAddress);
        user.rewardDebt = user.amount.mul(userRewardPerShare).div(1e12);

        require(withdrawAmount <= IERC20(_tokenAddress).balanceOf(address(this)), "Not enough liquidity on the pool to withdraw");

        IERC20(_tokenAddress).safeTransferFrom(address(this), _to, withdrawAmount);

        emit withdrawLiqudiity_EVENT(
            msg.sender,
            _to,
            pendingAmount,
            _amount,
            withdrawAmount,
            _tokenAddress
        );
    }

    /**
     * owner recover fee from ERC20
     * @param _amount Amount to transfer to the other account.
     * @param _tokenAddress ERC20 token address.
     * @param _to receiver to get the fee.
     */
    function ownerRecoverFee(
        uint256 _amount,
        address _tokenAddress,
        address _to
    )
        external
        onlyOwner()
    {
        PoolInfo storage pool = poolInfo[_tokenAddress];

        require(pool.accOwnerReward >= _amount, "Owner Reward Withdraw Error");
        require(IERC20(_tokenAddress).balanceOf(address(this)) >= _amount, "Not enough liquidity on the pool to withdraw");

        IERC20(_tokenAddress).safeTransferFrom(address(this), _to, _amount);

        pool.accOwnerReward = pool.accOwnerReward.sub(_amount);

        emit ownerRecoverFee_EVENT(
            msg.sender,
            _to,
            _tokenAddress,
            _amount
        );
    }

    /*************************
     * Cross-chain Functions *
     *************************/

    /**
     * Move funds from L1 to L2, and pay out from the right liquidity pool
     * @param _to Address to to be transferred.
     * @param _amount amount to to be transferred.
     * @param _tokenAddress L2 erc20 token.
     */
    function clientPayL2(
        address _to,
        uint256 _amount,
        address _tokenAddress
    )
        external
        onlyInitialized()
        onlyFromCrossDomainAccount(address(L1LiquidityPoolAddress))
    {   

        PoolInfo storage pool = poolInfo[_tokenAddress];

        //Augment the pool size for this ERC20
        uint256 userRewardFee = (_amount.mul(userRewardFeeRate)).div(1000);
        uint256 ownerRewardFee = (_amount.mul(ownerRewardFeeRate)).div(1000);
        uint256 totalFee = userRewardFee.add(ownerRewardFee);
        uint256 receivedAmount = _amount.sub(totalFee);

        require(receivedAmount <= pool.L1Balance, "L1 Insufficient Fund");

        IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), receivedAmount);

        pool.accUserReward = pool.accUserReward.add(userRewardFee);
        pool.accOwnerReward = pool.accOwnerReward.add(ownerRewardFee);
        pool.L1Balance = pool.L1Balance.add(_amount);

        emit clientPayL2_EVENT(
          _to,
          receivedAmount,
          userRewardFee,
          ownerRewardFee,
          totalFee,
          _tokenAddress
        );
    }
     
}
