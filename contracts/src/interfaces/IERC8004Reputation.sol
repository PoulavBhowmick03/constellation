// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC8004Reputation
/// @notice Interface for ERC-8004 Reputation Registry
/// @dev Canonical address on Mantle: 0x8004B663056A597Dffe9eCcC1965A193B7388713
interface IERC8004Reputation {
    struct FeedbackEntry {
        address reviewer;
        uint256 agentId;
        uint8 score;
        string tags;
        string evidenceURI;
        uint256 timestamp;
    }

    function giveFeedback(uint256 agentId, uint8 score, string calldata tags, string calldata evidenceURI) external;

    function getFeedbackCount(uint256 agentId) external view returns (uint256);
    function getAverageScore(uint256 agentId) external view returns (uint256);
    function getFeedback(uint256 agentId, uint256 index) external view returns (FeedbackEntry memory);
}
