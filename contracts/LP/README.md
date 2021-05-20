# Liquidity Pool

<img width="1243" alt="LP" src="https://user-images.githubusercontent.com/46272347/119060612-6455cc00-b987-11eb-9f8c-dfadfa029951.png">

The L2 liquidity pool is the main pool. It provides the ways to deposit and withdraw tokens for liquidity providers. Swap users can deposit ETH or ERC20 tokens to fastly exit the L2.

The L1 liquidity pool is the sub pool. Swap users can do fast onramp. When swap users do fast exit on the L2 liquidity pool, it sends funds to the swap users.

> For OMGX, there is no delays for users to move funds from L1 to L2. From my understanding, the liquidity pool is only used to help users fastly exist L2.

Each token in L2 liquidity pool has the pool data.

```
struct PoolInfo {
	address l1TokenAddress; // Address of token contract.
	address l2TokenAddress; // Address of toekn contract.
	uint256 L1Balance; // L1 token balance.
	uint256 accUserReward; // Accumulated user reward.
  uint256 accOwnerReward; // Accumulated owner reward.
}
```

## Liquidity Provider

* Deposit tokens

  > Providers can only deposit and withdraw tokens on L2, so they can save gas.

  When the provider deposits tokens, half of tokens will be moved to L1. It helps us balance the token amounts in L1 and L2.

  Each liquidity provider has the user info data.

  ```
  struct UserInfo {
  	uint256 amount;
  	uint256 rewardDebt;
  }
  ```

  The `amount` presents the total amount that the provider deposits. When the provider deposits the tokens for the first time, we calculate the initial `rewardDebt`:

  ```
  totalProviderDeposit = (L1Balance + L2Balance) - (pool.accUserReward + pool.accOwnerReward)
  userRewardPerShare = pool.accUserReward / totalProviderDeposit
  rewardDebt = userRewardPerShare * amount
  ```

  If the provider deposits more tokens, then we transfer the rewards to them first.

* Withdraw tokens

  When the provider withdraws some or all of tokens, we send the all rewards to them.

  > If L2 doesn't have enough tokens, we need to transfer tokens from L1 to L2.

## Swap User

Regardless of whether users deposit tokens on L1 or L2, we always calculate the fees on L2. 

## Contract Owner

The contract owner can withdraw `PoolInfo.accOwnerReward`.

