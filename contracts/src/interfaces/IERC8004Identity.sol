// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC8004Identity
/// @notice Interface for ERC-8004 Identity Registry
/// @dev Canonical address on Mantle: 0x8004A818BFB912233c491871b3d84c89A494BD9e
interface IERC8004Identity {
    function register(address agent) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
    function agentURI(uint256 agentId) external view returns (string memory);
}
