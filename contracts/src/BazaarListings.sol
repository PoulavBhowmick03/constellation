// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISkillRegistry {
    struct SkillInfo {
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

    function getSkill(uint256 skillId) external view returns (SkillInfo memory);
}

contract BazaarListings is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Tier {
        FREE,
        BASIC,
        PRO
    }

    struct Listing {
        uint256 skillId;
        address owner;
        Tier tier;
        uint256 paidUntil;
        uint256 listedAt;
        bool active;
    }

    address public immutable USDE;
    address public immutable skillRegistry;
    address public feeRecipient;

    uint256 public constant BASIC_MONTHLY_FEE = 10e18;
    uint256 public constant PRO_MONTHLY_FEE = 50e18;
    uint256 public constant MONTH_SECONDS = 31 days;

    mapping(uint256 => Listing) public listings;
    mapping(address => uint256[]) public ownerListings;

    event Listed(uint256 indexed skillId, address owner, Tier tier, uint256 paidUntil);
    event TierUpgraded(uint256 indexed skillId, Tier newTier, uint256 paidUntil);
    event Renewed(uint256 indexed skillId, uint256 newPaidUntil);
    event Delisted(uint256 indexed skillId);

    error AlreadyListed();
    error NotListingOwner();
    error NotSkillOwner();
    error SkillNotActive();
    error InsufficientPayment();

    constructor(address initialOwner, address usdeAddress, address _skillRegistry) Ownable(initialOwner) {
        USDE = usdeAddress;
        feeRecipient = initialOwner;
        skillRegistry = _skillRegistry;
    }

    function list(uint256 skillId, Tier tier) external nonReentrant {
        ISkillRegistry.SkillInfo memory skill = ISkillRegistry(skillRegistry).getSkill(skillId);
        if (skill.owner != msg.sender) revert NotSkillOwner();
        if (!skill.active) revert SkillNotActive();

        if (listings[skillId].listedAt > 0) revert AlreadyListed();

        uint256 paidUntil = block.timestamp;
        if (tier == Tier.BASIC) {
            IERC20(USDE).safeTransferFrom(msg.sender, feeRecipient, BASIC_MONTHLY_FEE);
            paidUntil = block.timestamp + MONTH_SECONDS;
        } else if (tier == Tier.PRO) {
            IERC20(USDE).safeTransferFrom(msg.sender, feeRecipient, PRO_MONTHLY_FEE);
            paidUntil = block.timestamp + MONTH_SECONDS;
        }

        listings[skillId] = Listing({
            skillId: skillId,
            owner: msg.sender,
            tier: tier,
            paidUntil: paidUntil,
            listedAt: block.timestamp,
            active: true
        });

        ownerListings[msg.sender].push(skillId);
        emit Listed(skillId, msg.sender, tier, paidUntil);
    }

    function renew(uint256 skillId) external nonReentrant {
        Listing storage l = listings[skillId];
        if (l.owner != msg.sender) revert NotListingOwner();

        uint256 fee = l.tier == Tier.PRO ? PRO_MONTHLY_FEE : BASIC_MONTHLY_FEE;
        if (l.tier == Tier.FREE) return;

        IERC20(USDE).safeTransferFrom(msg.sender, feeRecipient, fee);

        uint256 base = l.paidUntil > block.timestamp ? l.paidUntil : block.timestamp;
        l.paidUntil = base + MONTH_SECONDS;

        emit Renewed(skillId, l.paidUntil);
    }

    function delist(uint256 skillId) external {
        if (listings[skillId].owner != msg.sender) revert NotListingOwner();
        listings[skillId].active = false;
        emit Delisted(skillId);
    }

    function upgradeTier(uint256 skillId, Tier newTier) external {
        Listing storage l = listings[skillId];
        if (l.owner != msg.sender) revert NotListingOwner();
        if (uint8(newTier) <= uint8(l.tier)) revert("Can only upgrade tier");

        uint256 fee = newTier == Tier.PRO ? PRO_MONTHLY_FEE : BASIC_MONTHLY_FEE;
        IERC20(USDE).safeTransferFrom(msg.sender, feeRecipient, fee);

        uint256 base = l.paidUntil > block.timestamp ? l.paidUntil : block.timestamp;
        l.tier = newTier;
        l.paidUntil = base + MONTH_SECONDS;

        emit TierUpgraded(skillId, newTier, l.paidUntil);
    }

    function isActive(uint256 skillId) external view returns (bool) {
        Listing memory l = listings[skillId];
        if (!l.active) return false;
        if (l.tier == Tier.FREE) return true;
        return l.paidUntil >= block.timestamp;
    }

    function setFeeRecipient(address r) external onlyOwner {
        if (r == address(0)) revert("feeRecipient cannot be zero");
        feeRecipient = r;
    }
}
