// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "./ERC20.sol";

contract TokenPool {
    mapping(address => uint256) lastRequest;
    address token;
    address owner;
    
    event RequestToken (
        address _requestAddress,
        uint256 _timestamp,
        uint256 _amount
    );
    
    modifier onlyOwner() {
        require(owner == msg.sender);
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    function registerTokenAddress(
        address _token
    )   
        public
        onlyOwner() 
    {
        token = _token;
    }
    
    function requestToken() 
        public
    {
        ERC20 ERC20Token = ERC20(token);
        require(10e18 <= ERC20Token.balanceOf(address(this)), "Insufficient balance");
        require(lastRequest[msg.sender] + 60 * 60 <= block.timestamp, "Request limit");
        require(ERC20Token.transfer(msg.sender, 10e18));
        lastRequest[msg.sender] = block.timestamp;
        
        emit RequestToken(msg.sender, block.timestamp, 10e18);
    }
}