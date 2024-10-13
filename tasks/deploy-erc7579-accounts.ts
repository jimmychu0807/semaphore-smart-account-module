import { task, types } from "hardhat/config";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { toSafeSmartAccount } from "permissionless/accounts";

task("deploy:erc7579", "Deploy Smart Accounts ERC-7579").setAction(async (taskArgs, hre) => {
  // Assume the first user is the owner
  const [alice, bob] = await hre.viem.getWalletClients();
});
