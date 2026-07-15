// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract x402Escrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum EscrowStatus {
        PENDING,
        COMPLETED,
        DISPUTED,
        REFUNDED
    }

    struct EscrowJob {
        uint256 jobId;
        address consumer;
        address provider;
        address token;
        uint256 amount;
        uint256 skillId;
        string jobSpecURI;
        EscrowStatus status;
        uint256 createdAt;
        uint256 completedAt;
        uint256 disputeWindow;
        uint256 facilitatorFeeBps;
    }

    uint256 private _nextJobId;
    mapping(uint256 => EscrowJob) public jobs;
    mapping(address => bool) public allowedFacilitators;
    mapping(address => bool) public allowedTokens;

    address public feeRecipient;
    uint256 public constant DISPUTE_WINDOW = 24 hours;
    uint256 public constant MAX_FEE_BPS = 500;

    event JobCreated(
        uint256 indexed jobId,
        address indexed consumer,
        address indexed provider,
        uint256 skillId,
        uint256 amount,
        address token
    );
    event JobCompleted(uint256 indexed jobId, uint256 paidToProvider, uint256 fee);
    event JobRefunded(uint256 indexed jobId, address consumer, uint256 amount);
    event JobDisputed(uint256 indexed jobId, address disputedBy);

    error TokenNotAllowed();
    error NotAllowedFacilitator();
    error JobNotFound();
    error JobAlreadyFinalized();
    error DisputeWindowNotExpired();
    error AmountTooSmall();

    constructor(address initialOwner, address _feeRecipient, address[] memory initialTokens) Ownable(initialOwner) {
        feeRecipient = _feeRecipient;
        _nextJobId = 1;

        for (uint256 i = 0; i < initialTokens.length; i++) {
            allowedTokens[initialTokens[i]] = true;
        }
    }

    function createJob(
        address provider,
        address token,
        uint256 amount,
        uint256 skillId,
        string calldata jobSpecURI,
        uint256 facilitatorFeeBps
    ) external nonReentrant returns (uint256 jobId) {
        if (!allowedTokens[token]) revert TokenNotAllowed();
        if (amount == 0) revert AmountTooSmall();
        if (provider == address(0)) revert("provider cannot be zero address");
        if (provider == msg.sender) revert("provider cannot be caller");
        if (facilitatorFeeBps > MAX_FEE_BPS) facilitatorFeeBps = MAX_FEE_BPS;

        jobId = _nextJobId++;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        jobs[jobId] = EscrowJob({
            jobId: jobId,
            consumer: msg.sender,
            provider: provider,
            token: token,
            amount: amount,
            skillId: skillId,
            jobSpecURI: jobSpecURI,
            status: EscrowStatus.PENDING,
            createdAt: block.timestamp,
            completedAt: 0,
            disputeWindow: 0,
            facilitatorFeeBps: facilitatorFeeBps
        });

        emit JobCreated(jobId, msg.sender, provider, skillId, amount, token);
    }

    function completeJob(uint256 jobId) external nonReentrant {
        if (!allowedFacilitators[msg.sender]) revert NotAllowedFacilitator();

        EscrowJob storage job = jobs[jobId];
        if (job.jobId == 0) revert JobNotFound();
        if (job.status != EscrowStatus.PENDING) revert JobAlreadyFinalized();

        job.status = EscrowStatus.COMPLETED;
        job.completedAt = block.timestamp;
        job.disputeWindow = block.timestamp + DISPUTE_WINDOW;

        uint256 fee = (job.amount * job.facilitatorFeeBps) / 10000;
        uint256 payout = job.amount - fee;

        IERC20(job.token).safeTransfer(job.provider, payout);
        if (fee > 0) IERC20(job.token).safeTransfer(feeRecipient, fee);

        emit JobCompleted(jobId, payout, fee);
    }

    function refundJob(uint256 jobId) external nonReentrant {
        if (!allowedFacilitators[msg.sender]) revert NotAllowedFacilitator();

        EscrowJob storage job = jobs[jobId];
        if (job.jobId == 0) revert JobNotFound();
        if (job.status != EscrowStatus.PENDING) revert JobAlreadyFinalized();

        job.status = EscrowStatus.REFUNDED;
        IERC20(job.token).safeTransfer(job.consumer, job.amount);

        emit JobRefunded(jobId, job.consumer, job.amount);
    }

    function allowFacilitator(address f) external onlyOwner {
        allowedFacilitators[f] = true;
    }

    function revokeFacilitator(address f) external onlyOwner {
        allowedFacilitators[f] = false;
    }

    function allowToken(address t) external onlyOwner {
        allowedTokens[t] = true;
    }

    function setFeeRecipient(address r) external onlyOwner {
        if (r == address(0)) revert("feeRecipient cannot be zero");
        feeRecipient = r;
    }

    function getJob(uint256 jobId) external view returns (EscrowJob memory) {
        return jobs[jobId];
    }
}
