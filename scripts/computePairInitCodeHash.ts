/**
 * Computes the INIT_CODE_PAIR_HASH for JuiceSwap V2
 *
 * This hash is required by UniswapV2Library.pairFor() to compute
 * deterministic pair addresses using CREATE2.
 *
 * Run: npx hardhat run scripts/computePairInitCodeHash.ts
 *
 * After running, update the hash in:
 * - v2-periphery/contracts/libraries/UniswapV2Library.sol
 */

import { ethers } from "hardhat";

async function main() {
  console.log("Computing JuiceSwap V2 INIT_CODE_PAIR_HASH...\n");

  // Get the compiled bytecode of UniswapV2Pair
  const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
  const bytecode = UniswapV2Pair.bytecode;

  // Compute keccak256 hash of the bytecode
  const hash = ethers.keccak256(bytecode);

  console.log("UniswapV2Pair bytecode length:", bytecode.length, "bytes");
  console.log("\n========================================");
  console.log("INIT_CODE_PAIR_HASH:");
  console.log(hash);
  console.log("========================================\n");

  // Format for Solidity
  const hexWithoutPrefix = hash.slice(2);
  console.log("For UniswapV2Library.sol:");
  console.log(`bytes32 internal constant INIT_CODE_PAIR_HASH = hex'${hexWithoutPrefix}';`);
  console.log("\n");

  // Verify the LP token branding
  console.log("Verifying JuiceSwap branding...");
  const UniswapV2ERC20 = await ethers.getContractFactory("UniswapV2ERC20");
  // Note: We can't call view functions without deploying, so just confirm bytecode includes the strings
  const erc20Bytecode = UniswapV2ERC20.bytecode;

  // Check for JuiceSwap V2 string in bytecode (UTF-8 encoded)
  const juiceswapHex = Buffer.from("JuiceSwap V2").toString("hex");
  const juiceV2Hex = Buffer.from("JUICE-V2").toString("hex");

  if (erc20Bytecode.includes(juiceswapHex)) {
    console.log("LP token name: 'JuiceSwap V2' - FOUND");
  } else {
    console.log("LP token name: 'JuiceSwap V2' - NOT FOUND (check branding)");
  }

  if (erc20Bytecode.includes(juiceV2Hex)) {
    console.log("LP token symbol: 'JUICE-V2' - FOUND");
  } else {
    console.log("LP token symbol: 'JUICE-V2' - NOT FOUND (check branding)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
