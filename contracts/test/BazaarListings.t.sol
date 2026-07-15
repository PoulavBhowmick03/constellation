// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";
import {BazaarListings} from "../src/BazaarListings.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";

contract BazaarMockERC20 is ERC20 {
    constructor() ERC20("Mock USDe", "mUSDe") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BazaarListingsTest is Test {
    BazaarListings internal bazaar;
    SkillRegistry internal registry;
    BazaarMockERC20 internal usde;

    address internal owner = address(0xA11CE);
    address internal provider = address(0xB0B);
    address internal stranger = address(0xBAD);

    function setUp() public {
        vm.warp(1_000);

        usde = new BazaarMockERC20();
        registry = new SkillRegistry(owner);
        bazaar = new BazaarListings(owner, address(usde), address(registry));

        usde.mint(provider, 1_000e18);

        vm.prank(provider);
        usde.approve(address(bazaar), type(uint256).max);

        _registerSkillAs(provider);
    }

    function _registerSkillAs(address account) internal returns (uint256 skillId) {
        vm.prank(account);
        skillId = registry.registerSkill(
            "code-review", "1.0.0", "https://provider.example/review", 250, true, "ipfs://skill-metadata"
        );
    }

    function _listing(uint256 skillId) internal view returns (BazaarListings.Listing memory listing) {
        (
            uint256 listedSkillId,
            address listingOwner,
            BazaarListings.Tier tier,
            uint256 paidUntil,
            uint256 listedAt,
            bool active
        ) = bazaar.listings(skillId);

        listing = BazaarListings.Listing({
            skillId: listedSkillId,
            owner: listingOwner,
            tier: tier,
            paidUntil: paidUntil,
            listedAt: listedAt,
            active: active
        });
    }

    function testListFreeTierNoPayment() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.FREE);

        BazaarListings.Listing memory listing = _listing(1);
        assertEq(listing.skillId, 1);
        assertEq(listing.owner, provider);
        assertEq(uint256(listing.tier), uint256(BazaarListings.Tier.FREE));
        assertEq(listing.paidUntil, 1_000);
        assertTrue(listing.active);
        assertEq(usde.balanceOf(owner), 0);
    }

    function testListBasicTierPaymentTaken() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.BASIC);

        BazaarListings.Listing memory listing = _listing(1);
        assertEq(uint256(listing.tier), uint256(BazaarListings.Tier.BASIC));
        assertEq(listing.paidUntil, 1_000 + bazaar.MONTH_SECONDS());
        assertEq(usde.balanceOf(owner), bazaar.BASIC_MONTHLY_FEE());
        assertEq(usde.balanceOf(provider), 1_000e18 - bazaar.BASIC_MONTHLY_FEE());
    }

    function testListProTierPaymentTaken() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.PRO);

        BazaarListings.Listing memory listing = _listing(1);
        assertEq(uint256(listing.tier), uint256(BazaarListings.Tier.PRO));
        assertEq(listing.paidUntil, 1_000 + bazaar.MONTH_SECONDS());
        assertEq(usde.balanceOf(owner), bazaar.PRO_MONTHLY_FEE());
        assertEq(usde.balanceOf(provider), 1_000e18 - bazaar.PRO_MONTHLY_FEE());
    }

    function test_List_RevertsAlreadyListed() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.FREE);

        vm.prank(provider);
        vm.expectRevert(BazaarListings.AlreadyListed.selector);
        bazaar.list(1, BazaarListings.Tier.BASIC);
    }

    function test_List_RevertsForNonSkillOwner() public {
        vm.prank(stranger);
        vm.expectRevert(BazaarListings.NotSkillOwner.selector);
        bazaar.list(1, BazaarListings.Tier.FREE);
    }

    function test_List_RevertsForInactiveSkill() public {
        vm.prank(provider);
        registry.deactivateSkill(1);

        vm.prank(provider);
        vm.expectRevert(BazaarListings.SkillNotActive.selector);
        bazaar.list(1, BazaarListings.Tier.FREE);
    }

    function test_Delist_ByOwner() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.FREE);

        vm.prank(provider);
        bazaar.delist(1);

        assertFalse(_listing(1).active);
        assertFalse(bazaar.isActive(1));
    }

    function test_UpgradeTier_BasicToPro() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.BASIC);

        uint256 firstPaidUntil = _listing(1).paidUntil;

        vm.prank(provider);
        bazaar.upgradeTier(1, BazaarListings.Tier.PRO);

        BazaarListings.Listing memory listing = _listing(1);
        assertEq(uint256(listing.tier), uint256(BazaarListings.Tier.PRO));
        assertEq(listing.paidUntil, firstPaidUntil + bazaar.MONTH_SECONDS());
        assertEq(usde.balanceOf(owner), bazaar.BASIC_MONTHLY_FEE() + bazaar.PRO_MONTHLY_FEE());
    }

    function testRenewBasicSubscription() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.BASIC);

        uint256 firstPaidUntil = _listing(1).paidUntil;

        vm.prank(provider);
        bazaar.renew(1);

        assertEq(_listing(1).paidUntil, firstPaidUntil + bazaar.MONTH_SECONDS());
        assertEq(usde.balanceOf(owner), bazaar.BASIC_MONTHLY_FEE() * 2);
    }

    function testIsActiveFreeTierAlwaysActive() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.FREE);

        vm.warp(1_000 + 365 days);
        assertTrue(bazaar.isActive(1));
    }

    function testIsActivePaidTierBeforePaidUntil() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.BASIC);

        vm.warp(1_000 + bazaar.MONTH_SECONDS() - 1);
        assertTrue(bazaar.isActive(1));
    }

    function testIsActivePaidTierExpiredAfterPaidUntil() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.BASIC);

        vm.warp(1_000 + bazaar.MONTH_SECONDS() + 1);
        assertFalse(bazaar.isActive(1));
    }

    function testRenewByNonOwnerReverts() public {
        vm.prank(provider);
        bazaar.list(1, BazaarListings.Tier.BASIC);

        vm.prank(stranger);
        vm.expectRevert(BazaarListings.NotListingOwner.selector);
        bazaar.renew(1);
    }
}
