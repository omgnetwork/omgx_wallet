## AtomicSwap

The original contract is [here](https://github.com/confio/eth-atomic-swap/blob/master/contracts/AtomicSwapERC20.sol). It has been simplified.

## open function

The open function is used to create an agreement for both sides.  `_secretLock` and `_timelock` are removed in the new contract. `_secreteLock` is used to verify the `_secretKey`  in the close function.

```javascript
require(swaps[_swapID].secretLock == sha256(_secretKey));
```

Using the secrete key means that we have to add another step in our system, so the `onlyCloseTrader` modifier is added to replace the `_secreteKey`. 

```
modifier onlyCloseTrader(bytes32 _swapID) {
    Swap memory swap = swaps[_swapID];
    require(msg.sender == swap.closeTrader);
    _;
}
```

`_timelock` prevents people from expiring the swap before a certain time. It's not useful for the Varna, so it's removed.

The open trader has to transfer the ERC20 to this contract when they open the swap. It is not convenient for the open trader. If the close trader doesn't close the swap, the open trader has to call `expire` function to get the ERC20 back. Thus, the requirement of transferring the ERC20 is removed.

```diff
     function open(
         bytes32 _swapID, 
-        uint256 _erc20Value, 
-        address _erc20ContractAddress, 
-        address _withdrawTrader,
-        bytes32 _secretLock, 
-        uint256 _timelock
+        uint256 _openValue, 
+        address _openContractAddress, 
+        uint256 _closeValue, 
+        address _closeTrader, 
+        address _closeContractAddress
     ) 
         public 
         onlyInvalidSwaps(_swapID) 
-    {
+    {   
         require(swapStates[_swapID] == States.INVALID);
-        // Transfer value from the ERC20 trader to this contract.
-        ERC20 erc20Contract = ERC20(_erc20ContractAddress);
-        require(_erc20Value <= erc20Contract.allowance(msg.sender, address(this)));
-        require(erc20Contract.transferFrom(msg.sender, address(this), _erc20Value));
-
         // Store the details of the swap.
         Swap memory swap = Swap({
-            timelock: _timelock,
-            erc20Value: _erc20Value,
-            erc20Trader: msg.sender,
-            erc20ContractAddress: _erc20ContractAddress,
-            withdrawTrader: _withdrawTrader,
-            secretLock: _secretLock,
-            secretKey: new bytes(0)
+            openValue: _openValue,
+            openTrader: msg.sender,
+            openContractAddress: _openContractAddress,
+            closeValue: _closeValue,
+            closeTrader: _closeTrader,
+            closeContractAddress: _closeContractAddress
         });
         swaps[_swapID] = swap;
         swapStates[_swapID] = States.OPEN;
-    }
```

## close function

When the close trader confirms all the information, they call the `close function` to finalize the swap. `onlyWithSecretKey(_swapID, _secretKey)` is replaced by `onlyCloseTrader(_swapID) `.  Using `onlyCloseTrader(_swapID) ` can get rid of the secret key and guarantee security.

```js
modifier onlyCloseTrader(bytes32 _swapID) {
    Swap memory swap = swaps[_swapID];
    require(msg.sender == swap.closeTrader);
    _;
}
```

This function makes sure that both sides have enough tokens and allowances are larger than the transferred amount. Only the verification is done, the contract starts to transfer the ERC20 between two parties.

```diff
     function close(
-        bytes32 _swapID, 
-        bytes memory _secretKey
+        bytes32 _swapID
     ) 
         public 
-        onlyOpenSwaps(_swapID)
-        onlyWithSecretKey(_swapID, _secretKey) 
+        onlyOpenSwaps(_swapID) 
+        onlyCloseTrader(_swapID) 
     {
-        // Close the swap.
         Swap memory swap = swaps[_swapID];
-        swaps[_swapID].secretKey = _secretKey;
-        swapStates[_swapID] = States.CLOSED;
 
-        // Transfer the ERC20 funds from this contract to the withdrawing trader.
-        ERC20 erc20Contract = ERC20(swap.erc20ContractAddress);
-        require(erc20Contract.transfer(swap.withdrawTrader, swap.erc20Value));
+        // both parties have enough tokens
+        ERC20 openERC20Contract = ERC20(swap.openContractAddress);
+        ERC20 closeERC20Contract = ERC20(swap.closeContractAddress);
+        require(swap.openValue <= openERC20Contract.allowance(swap.openTrader, address(this)));
+        require(swap.openValue <= openERC20Contract.balanceOf(swap.openTrader));
+        require(swap.closeValue <= closeERC20Contract.allowance(swap.closeTrader, address(this)));
+        require(swap.closeValue <= closeERC20Contract.balanceOf(swap.closeTrader));
+
+        // Transfer the closing funds from the closing trader to the opening trader.
+        require(closeERC20Contract.transferFrom(swap.closeTrader, swap.openTrader, swap.closeValue));
+
+        // Transfer the opening funds from opening trader to the closing trader.
+        require(openERC20Contract.transferFrom(swap.openTrader, swap.closeTrader, swap.openValue));
 
-        emit Close(_swapID, _secretKey);
+        swapStates[_swapID] = States.CLOSED;
+
+        emit Close(_swapID);
     }
```

## expire function

If any party regrets to open the swap, they can call `expire function` to dump it. `onlyExpirableSwaps(_swapID)` is replaced by `onlyTraders(_swapID)`. Only the open trader and close trader allow to expire the open swap. 

```js
modifier onlyTraders(bytes _swapID) {
    Swap memory swap = swaps[_swapID];
    require(msg.sender == swap.openTrader || msg.sender == swap.closeTrader);
    _;
}
```

We don't transfer ERC20 in the open function, so there is no need to send the ERC20 back.

```diff
     function expire(
@@ -111,27 +110,34 @@
     ) 
         public 
         onlyOpenSwaps(_swapID) 
-        onlyExpirableSwaps(_swapID) 
+        onlyTraders(_swapID)
     {
         // Expire the swap.
-        Swap memory swap = swaps[_swapID];
         swapStates[_swapID] = States.EXPIRED;
 
-        // Transfer the ERC20 value from this contract back to the ERC20 trader.
-        ERC20 erc20Contract = ERC20(swap.erc20ContractAddress);
-        require(erc20Contract.transfer(swap.erc20Trader, swap.erc20Value));
-
         emit Expire(_swapID);
     }
```

## check function

The check function returns the `Swap struct`.

```diff
@@ -130,25 +124,20 @@
         public 
         view 
         returns (
-            uint256 timelock, 
-            uint256 erc20Value,
-            address erc20ContractAddress, 
-            address withdrawTrader, 
-            bytes32 secretLock
+            uint256 openValue, 
+            address openContractAddress, 
+            uint256 closeValue, 
+            address closeTrader, 
+            address closeContractAddress
         ) 
     {
         Swap memory swap = swaps[_swapID];
         return (
-            swap.timelock, 
-            swap.erc20Value, 
-            swap.erc20ContractAddress, 
-            swap.withdrawTrader, 
-            swap.secretLock
+            swap.openValue, 
+            swap.openContractAddress, 
+            swap.closeValue, 
+            swap.closeTrader, 
+            swap.closeContractAddress
         );
     }
```

