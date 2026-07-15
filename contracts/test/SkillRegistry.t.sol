// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Test} from "forge-std/Test.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";

contract SkillRegistryTest is Test {
    SkillRegistry internal registry;

    address internal owner = address(0xA11CE);
    address internal provider = address(0xB0B);
    address internal facilitator = address(0xFAC);
    address internal stranger = address(0xBAD);

    function setUp() public {
        vm.warp(1_000);
        registry = new SkillRegistry(owner);
    }

    function _registerAs(address account) internal returns (uint256 skillId) {
        vm.prank(account);
        skillId = registry.registerSkill(
            "code-review", "1.0.0", "https://provider.example/review", 250, true, "ipfs://skill-metadata"
        );
    }

    function testRegisterSkillBasicFlow() public {
        uint256 skillId = _registerAs(provider);

        SkillRegistry.Skill memory skill = registry.getSkill(skillId);
        assertEq(skill.skillId, 1);
        assertEq(skill.owner, provider);
        assertEq(skill.name, "code-review");
        assertEq(skill.version, "1.0.0");
        assertEq(skill.endpoint, "https://provider.example/review");
        assertEq(skill.pricePerCallBps, 250);
        assertTrue(skill.requiresEscrow);
        assertEq(skill.metadataURI, "ipfs://skill-metadata");
        assertEq(skill.registeredAt, 1_000);
        assertTrue(skill.active);
        assertEq(registry.totalSkills(), 1);

        uint256[] memory providerSkills = registry.getOwnerSkills(provider);
        assertEq(providerSkills.length, 1);
        assertEq(providerSkills[0], skillId);
    }

    function testRegisterSkillWithNoERC8004BytecodeFallsBackGracefully() public {
        uint256 skillId = _registerAs(provider);

        SkillRegistry.Skill memory skill = registry.getSkill(skillId);
        assertEq(skill.erc8004AgentId, 0);
    }

    function testUpdateSkillByOwner() public {
        uint256 skillId = _registerAs(provider);

        vm.prank(provider);
        registry.updateSkill(skillId, "https://provider.example/v2", 375, "ipfs://updated");

        SkillRegistry.Skill memory skill = registry.getSkill(skillId);
        assertEq(skill.endpoint, "https://provider.example/v2");
        assertEq(skill.pricePerCallBps, 375);
        assertEq(skill.metadataURI, "ipfs://updated");
    }

    function testUpdateSkillByNonOwnerReverts() public {
        uint256 skillId = _registerAs(provider);

        vm.prank(stranger);
        vm.expectRevert(SkillRegistry.NotSkillOwner.selector);
        registry.updateSkill(skillId, "https://evil.example", 1, "ipfs://evil");
    }

    function testDeactivateAndReactivate() public {
        uint256 skillId = _registerAs(provider);

        vm.prank(provider);
        registry.deactivateSkill(skillId);
        assertFalse(registry.getSkill(skillId).active);

        vm.prank(provider);
        registry.reactivateSkill(skillId);
        assertTrue(registry.getSkill(skillId).active);
    }

    function testRecordJobCompletionByAllowedFacilitator() public {
        uint256 skillId = _registerAs(provider);

        vm.prank(owner);
        registry.allowFacilitator(facilitator);

        vm.prank(facilitator);
        registry.recordJobCompletion(skillId, 90);

        SkillRegistry.Skill memory skill = registry.getSkill(skillId);
        assertEq(skill.totalJobs, 1);
        assertEq(skill.totalScore, 90);
        assertEq(registry.getAverageScore(skillId), 90);
    }

    function testRecordJobCompletionByNonFacilitatorReverts() public {
        uint256 skillId = _registerAs(provider);

        vm.prank(stranger);
        vm.expectRevert(SkillRegistry.NotAllowedFacilitator.selector);
        registry.recordJobCompletion(skillId, 90);
    }

    function testGetAverageScoreAfterMultipleJobs() public {
        uint256 skillId = _registerAs(provider);

        vm.prank(owner);
        registry.allowFacilitator(owner);

        vm.prank(owner);
        registry.recordJobCompletion(skillId, 80);

        vm.prank(owner);
        registry.recordJobCompletion(skillId, 100);

        vm.prank(owner);
        registry.recordJobCompletion(skillId, 70);

        assertEq(registry.getAverageScore(skillId), 83);
    }

    function test_RecordJobCompletion_RevertsForInactiveSkill() public {
        uint256 skillId = _registerAs(provider);

        vm.prank(owner);
        registry.allowFacilitator(facilitator);

        vm.prank(provider);
        registry.deactivateSkill(skillId);

        vm.prank(facilitator);
        vm.expectRevert(SkillRegistry.SkillNotActive.selector);
        registry.recordJobCompletion(skillId, 90);
    }

    function testAllowFacilitatorRevokeFacilitatorOnlyOwner() public {
        vm.prank(owner);
        registry.allowFacilitator(facilitator);
        assertTrue(registry.allowedFacilitators(facilitator));

        vm.prank(owner);
        registry.revokeFacilitator(facilitator);
        assertFalse(registry.allowedFacilitators(facilitator));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.allowFacilitator(stranger);
    }

    function testPauseUnpauseBlocksRegistrationWhilePaused() public {
        vm.prank(owner);
        registry.pause();

        vm.prank(provider);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        registry.registerSkill("code-review", "1.0.0", "https://provider.example/review", 250, true, "ipfs://skill");

        vm.prank(owner);
        registry.unpause();

        uint256 skillId = _registerAs(provider);
        assertEq(skillId, 1);
    }
}
