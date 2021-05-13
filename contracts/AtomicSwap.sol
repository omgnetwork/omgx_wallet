// SPDX-License-Identifier: MIT
pragma solidity >0.5.0;

import "./ERC20.sol";

contract AtomicSwap {

    struct Swap {
        uint256 openValue;
        address openTrader;
        address openContractAddress;
        uint256 closeValue;
        address closeTrader;
        address closeContractAddress;
    }

    enum States {
        INVALID,
        OPEN,
        CLOSED,
        EXPIRED
    }

    mapping (bytes32 => Swap) private swaps;
    mapping (bytes32 => States) private swapStates;

    event Open(bytes32 _swapID, address _closeTrader);
    event Expire(bytes32 _swapID);
    event Close(bytes32 _swapID);

    modifier onlyInvalidSwaps(bytes32 _swapID) {
        require (swapStates[_swapID] == States.INVALID);
        _;
    }

    modifier onlyOpenSwaps(bytes32 _swapID) {
        require (swapStates[_swapID] == States.OPEN);
        _;
    }

    modifier onlyCloseTrader(bytes32 _swapID) {
        Swap memory swap = swaps[_swapID];
        require(msg.sender == swap.closeTrader);
        _;
    }

    modifier onlyTraders(bytes _swapID) {
        Swap memory swap = swaps[_swapID];
        require(msg.sender == swap.openTrader || msg.sender == swap.closeTrader);
        _;
    }

    function open(
        bytes32 _swapID, 
        uint256 _openValue, 
        address _openContractAddress, 
        uint256 _closeValue, 
        address _closeTrader, 
        address _closeContractAddress
    ) 
        public 
        onlyInvalidSwaps(_swapID) 
    {   
        require(swapStates[_swapID] == States.INVALID);
        // Store the details of the swap.
        Swap memory swap = Swap({
            openValue: _openValue,
            openTrader: msg.sender,
            openContractAddress: _openContractAddress,
            closeValue: _closeValue,
            closeTrader: _closeTrader,
            closeContractAddress: _closeContractAddress
        });
        swaps[_swapID] = swap;
        swapStates[_swapID] = States.OPEN;

        emit Open(_swapID, _closeTrader);
    }

    function close(
        bytes32 _swapID
    ) 
        public 
        onlyOpenSwaps(_swapID) 
        onlyCloseTrader(_swapID) 
    {
        Swap memory swap = swaps[_swapID];

        // both parties have enough tokens
        ERC20 openERC20Contract = ERC20(swap.openContractAddress);
        ERC20 closeERC20Contract = ERC20(swap.closeContractAddress);
        require(swap.openValue <= openERC20Contract.allowance(swap.openTrader, address(this)));
        require(swap.openValue <= openERC20Contract.balanceOf(swap.openTrader));
        require(swap.closeValue <= closeERC20Contract.allowance(swap.closeTrader, address(this)));
        require(swap.closeValue <= closeERC20Contract.balanceOf(swap.closeTrader));

        // Transfer the closing funds from the closing trader to the opening trader.
        require(closeERC20Contract.transferFrom(swap.closeTrader, swap.openTrader, swap.closeValue));

        // Transfer the opening funds from opening trader to the closing trader.
        require(openERC20Contract.transferFrom(swap.openTrader, swap.closeTrader, swap.openValue));

        swapStates[_swapID] = States.CLOSED;

        emit Close(_swapID);
    }

    function expire(
        bytes32 _swapID
    ) 
        public 
        onlyOpenSwaps(_swapID) 
        onlyTraders(_swapID)
    {
        // Expire the swap.
        swapStates[_swapID] = States.EXPIRED;

        emit Expire(_swapID);
    }

    function check(
        bytes32 _swapID
    ) 
        public 
        view 
        returns (
            uint256 openValue, 
            address openContractAddress, 
            uint256 closeValue, 
            address closeTrader, 
            address closeContractAddress
        ) 
    {
        Swap memory swap = swaps[_swapID];
        return (
            swap.openValue, 
            swap.openContractAddress, 
            swap.closeValue, 
            swap.closeTrader, 
            swap.closeContractAddress
        );
    }
}