// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {x402Escrow} from "../src/x402Escrow.sol";
import {BazaarListings} from "../src/BazaarListings.sol";

contract Deploy is Script {
    // Celo Alfajores stables; override via env for mainnet (Celo, 42220).
    // cUSD is the primary listing-fee token (was USDe on Mantle).
    address constant CUSD = 0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1;
    address constant USDC = 0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B;

    function run() external {
        address deployer = msg.sender;
        address cusd = vm.envOr("CUSD_ADDRESS", CUSD);
        address usdc = vm.envOr("USDC_ADDRESS", USDC);

        vm.startBroadcast();

        SkillRegistry registry = new SkillRegistry(deployer);
        console.log(string.concat("SKILL_REGISTRY_ADDRESS=", vm.toString(address(registry))));

        address[] memory tokens = new address[](2);
        tokens[0] = cusd;
        tokens[1] = usdc;
        x402Escrow escrow = new x402Escrow(deployer, deployer, tokens);
        console.log(string.concat("X402_ESCROW_ADDRESS=", vm.toString(address(escrow))));

        BazaarListings bazaar = new BazaarListings(deployer, cusd, address(registry));
        console.log(string.concat("BAZAAR_LISTINGS_ADDRESS=", vm.toString(address(bazaar))));

        vm.stopBroadcast();

        console.log("---");
        console.log("Update .env with above addresses before running the facilitator.");
    }
}
