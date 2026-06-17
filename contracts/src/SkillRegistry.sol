// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";

contract SkillRegistry is Ownable, Pausable {
    struct Skill {
        uint256 skillId;
        address owner;
        string name;
        string version;
        string endpoint;
        uint256 pricePerCallBps;
        bool requiresEscrow;
        string metadataURI;
        uint256 erc8004AgentId;
        uint256 registeredAt;
        uint256 totalJobs;
        uint256 totalScore;
        bool active;
    }

    address public constant ERC8004_IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    uint256 private _nextSkillId;
    mapping(uint256 => Skill) public skills;
    mapping(address => uint256[]) public ownerSkills;
    mapping(address => bool) public allowedFacilitators;

    event SkillRegistered(
        uint256 indexed skillId,
        address indexed owner,
        string name,
        string version,
        uint256 erc8004AgentId,
        uint256 timestamp
    );
    event SkillUpdated(uint256 indexed skillId, string endpoint, uint256 pricePerCallBps);
    event SkillDeactivated(uint256 indexed skillId);
    event SkillReactivated(uint256 indexed skillId);
    event JobCompleted(uint256 indexed skillId, uint8 reputationScore, uint256 newAvgScore);
    event FacilitatorAllowed(address indexed facilitator);
    event FacilitatorRevoked(address indexed facilitator);

    error NotSkillOwner();
    error SkillNotActive();
    error SkillNotFound();
    error NotAllowedFacilitator();
    error InvalidScore();

    constructor(address initialOwner) Ownable(initialOwner) {
        _nextSkillId = 1;
    }

    function registerSkill(
        string calldata name,
        string calldata version,
        string calldata endpoint,
        uint256 pricePerCallBps,
        bool requiresEscrow,
        string calldata metadataURI
    ) external whenNotPaused returns (uint256 skillId) {
        skillId = _nextSkillId++;

        uint256 agentId;
        if (ERC8004_IDENTITY.code.length > 0) {
            try IERC8004Identity(ERC8004_IDENTITY).register(address(this)) returns (uint256 id) {
                agentId = id;
            } catch {
                agentId = 0;
            }
        }

        skills[skillId] = Skill({
            skillId: skillId,
            owner: msg.sender,
            name: name,
            version: version,
            endpoint: endpoint,
            pricePerCallBps: pricePerCallBps,
            requiresEscrow: requiresEscrow,
            metadataURI: metadataURI,
            erc8004AgentId: agentId,
            registeredAt: block.timestamp,
            totalJobs: 0,
            totalScore: 0,
            active: true
        });

        ownerSkills[msg.sender].push(skillId);

        emit SkillRegistered(skillId, msg.sender, name, version, agentId, block.timestamp);
    }

    function updateSkill(
        uint256 skillId,
        string calldata endpoint,
        uint256 pricePerCallBps,
        string calldata metadataURI
    ) external {
        if (skillId == 0 || skillId >= _nextSkillId) revert SkillNotFound();
        if (skills[skillId].owner != msg.sender) revert NotSkillOwner();

        skills[skillId].endpoint = endpoint;
        skills[skillId].pricePerCallBps = pricePerCallBps;
        skills[skillId].metadataURI = metadataURI;

        emit SkillUpdated(skillId, endpoint, pricePerCallBps);
    }

    function deactivateSkill(uint256 skillId) external {
        if (skillId == 0 || skillId >= _nextSkillId) revert SkillNotFound();
        if (skills[skillId].owner != msg.sender) revert NotSkillOwner();
        skills[skillId].active = false;
        emit SkillDeactivated(skillId);
    }

    function reactivateSkill(uint256 skillId) external {
        if (skillId == 0 || skillId >= _nextSkillId) revert SkillNotFound();
        if (skills[skillId].owner != msg.sender) revert NotSkillOwner();
        skills[skillId].active = true;
        emit SkillReactivated(skillId);
    }

    /// @notice Called by the x402 facilitator after successful job settlement.
    /// @param skillId The skill that was executed.
    /// @param reputationScore 0-100 score for this job.
    function recordJobCompletion(uint256 skillId, uint8 reputationScore) external {
        if (!allowedFacilitators[msg.sender]) revert NotAllowedFacilitator();
        if (skillId == 0 || skillId >= _nextSkillId) revert SkillNotFound();
        if (reputationScore > 100) revert InvalidScore();
        if (!skills[skillId].active) revert SkillNotActive();

        Skill storage skill = skills[skillId];
        skill.totalJobs++;
        skill.totalScore += reputationScore;

        uint256 newAvg = skill.totalScore / skill.totalJobs;
        emit JobCompleted(skillId, reputationScore, newAvg);
    }

    function allowFacilitator(address facilitator) external onlyOwner {
        allowedFacilitators[facilitator] = true;
        emit FacilitatorAllowed(facilitator);
    }

    function revokeFacilitator(address facilitator) external onlyOwner {
        allowedFacilitators[facilitator] = false;
        emit FacilitatorRevoked(facilitator);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getSkill(uint256 skillId) external view returns (Skill memory) {
        if (skillId == 0 || skillId >= _nextSkillId) revert SkillNotFound();
        return skills[skillId];
    }

    function getAverageScore(uint256 skillId) external view returns (uint256) {
        if (skillId == 0 || skillId >= _nextSkillId) revert SkillNotFound();

        Skill memory skill = skills[skillId];
        if (skill.totalJobs == 0) return 0;
        return skill.totalScore / skill.totalJobs;
    }

    function getOwnerSkills(address owner) external view returns (uint256[] memory) {
        return ownerSkills[owner];
    }

    function totalSkills() external view returns (uint256) {
        return _nextSkillId - 1;
    }
}
