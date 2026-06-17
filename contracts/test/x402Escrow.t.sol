// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";
import {x402Escrow} from "../src/x402Escrow.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USDe", "mUSDe") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract x402EscrowTest is Test {
    x402Escrow internal escrow;
    MockERC20 internal token;
    MockERC20 internal otherToken;

    address internal owner = address(0xA11CE);
    address internal consumer = address(0xC0FFEE);
    address internal provider = address(0xB0B);
    address internal feeRecipient = address(0xFEE);
    address internal stranger = address(0xBAD);

    function setUp() public {
        vm.warp(1_000);

        token = new MockERC20();
        otherToken = new MockERC20();

        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        escrow = new x402Escrow(owner, feeRecipient, tokens);

        token.mint(consumer, 1_000e18);
        otherToken.mint(consumer, 1_000e18);

        vm.prank(consumer);
        token.approve(address(escrow), type(uint256).max);

        vm.prank(consumer);
        otherToken.approve(address(escrow), type(uint256).max);

        vm.prank(owner);
        escrow.allowFacilitator(owner);
    }

    function _createJob(uint256 amount, uint256 feeBps) internal returns (uint256 jobId) {
        vm.prank(consumer);
        jobId = escrow.createJob(provider, address(token), amount, 1, "ipfs://job-spec", feeBps);
    }

    function testCreateJobWithAllowedToken() public {
        uint256 jobId = _createJob(100e18, 20);

        x402Escrow.EscrowJob memory job = escrow.getJob(jobId);
        assertEq(job.jobId, 1);
        assertEq(job.consumer, consumer);
        assertEq(job.provider, provider);
        assertEq(job.token, address(token));
        assertEq(job.amount, 100e18);
        assertEq(job.skillId, 1);
        assertEq(job.jobSpecURI, "ipfs://job-spec");
        assertEq(uint256(job.status), uint256(x402Escrow.EscrowStatus.PENDING));
        assertEq(token.balanceOf(address(escrow)), 100e18);
    }

    function testCreateJobWithDisallowedTokenReverts() public {
        vm.prank(consumer);
        vm.expectRevert(x402Escrow.TokenNotAllowed.selector);
        escrow.createJob(provider, address(otherToken), 100e18, 1, "ipfs://job-spec", 20);
    }

    function test_CreateJob_RevertsZeroProvider() public {
        vm.prank(consumer);
        vm.expectRevert("provider cannot be zero address");
        escrow.createJob(address(0), address(token), 100e18, 1, "uri", 20);
    }

    function test_CreateJob_RevertsSelfDealing() public {
        vm.prank(consumer);
        vm.expectRevert("provider cannot be caller");
        escrow.createJob(consumer, address(token), 100e18, 1, "uri", 20);
    }

    function testCompleteJobByAllowedFacilitatorTransfersFunds() public {
        uint256 jobId = _createJob(100e18, 20);

        vm.prank(owner);
        escrow.completeJob(jobId);

        assertEq(token.balanceOf(provider), 99.8e18);
        assertEq(token.balanceOf(feeRecipient), 0.2e18);
        assertEq(token.balanceOf(address(escrow)), 0);

        x402Escrow.EscrowJob memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(x402Escrow.EscrowStatus.COMPLETED));
        assertEq(job.completedAt, 1_000);
        assertEq(job.disputeWindow, 1_000 + escrow.DISPUTE_WINDOW());
    }

    function testRefundJobByAllowedFacilitator() public {
        uint256 jobId = _createJob(100e18, 20);

        vm.prank(owner);
        escrow.refundJob(jobId);

        assertEq(token.balanceOf(consumer), 1_000e18);
        assertEq(token.balanceOf(provider), 0);
        assertEq(token.balanceOf(feeRecipient), 0);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(uint256(escrow.getJob(jobId).status), uint256(x402Escrow.EscrowStatus.REFUNDED));
    }

    function testCompleteJobByNonFacilitatorReverts() public {
        uint256 jobId = _createJob(100e18, 20);

        vm.prank(stranger);
        vm.expectRevert(x402Escrow.NotAllowedFacilitator.selector);
        escrow.completeJob(jobId);
    }

    function testFeeCalculationAtVariousBpsValues() public {
        uint256 jobOne = _createJob(100e18, 0);
        vm.prank(owner);
        escrow.completeJob(jobOne);
        assertEq(token.balanceOf(provider), 100e18);
        assertEq(token.balanceOf(feeRecipient), 0);

        uint256 jobTwo = _createJob(100e18, 100);
        vm.prank(owner);
        escrow.completeJob(jobTwo);
        assertEq(token.balanceOf(provider), 199e18);
        assertEq(token.balanceOf(feeRecipient), 1e18);

        uint256 jobThree = _createJob(100e18, 1_000);
        vm.prank(owner);
        escrow.completeJob(jobThree);
        assertEq(token.balanceOf(provider), 294e18);
        assertEq(token.balanceOf(feeRecipient), 6e18);

        x402Escrow.EscrowJob memory capped = escrow.getJob(jobThree);
        assertEq(capped.facilitatorFeeBps, escrow.MAX_FEE_BPS());
    }

    function testGetJobViewFunction() public {
        uint256 jobId = _createJob(42e18, 35);

        x402Escrow.EscrowJob memory job = escrow.getJob(jobId);
        assertEq(job.jobId, jobId);
        assertEq(job.amount, 42e18);
        assertEq(job.facilitatorFeeBps, 35);
    }
}
