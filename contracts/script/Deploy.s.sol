// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {x402Escrow} from "../src/x402Escrow.sol";
import {BazaarListings} from "../src/BazaarListings.sol";

contract Deploy is Script {
    address constant USDE = 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34;
    address constant USDC = 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9;

    function run() external {
        address deployer = msg.sender;

        vm.startBroadcast();

        SkillRegistry registry = new SkillRegistry(deployer);
        console.log(string.concat("SKILL_REGISTRY_ADDRESS=", vm.toString(address(registry))));

        address[] memory tokens = new address[](2);
        tokens[0] = USDE;
        tokens[1] = USDC;
        x402Escrow escrow = new x402Escrow(deployer, deployer, tokens);
        console.log(string.concat("X402_ESCROW_ADDRESS=", vm.toString(address(escrow))));

        BazaarListings bazaar = new BazaarListings(deployer, USDE, address(registry));
        console.log(string.concat("BAZAAR_LISTINGS_ADDRESS=", vm.toString(address(bazaar))));

        vm.stopBroadcast();

        console.log("---");
        console.log("Update .env with above addresses before running the facilitator.");
    }
}
