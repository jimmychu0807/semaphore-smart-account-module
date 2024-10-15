import { task, types } from "hardhat/config";
import { createPublicClient, createTestClient, encodePacked, http, parseEther } from "viem";
import { hardhat, foundry } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createBundlerClient, entryPoint07Address } from "viem/account-abstraction";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount, toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";

import {
  NODE_URL,
  BUNDLER_URL,
  PAYMASTER_URL,
  PRIVATE_KEY,
  SAFE_4337_MODULE_ADDR,
  ERC_7579_LAUNCHPAD_ADDR,
} from "../config";

task("deploy:erc7579", "Deploy ERC-7579 extended Smart Accounts")
  .addOptionalParam<boolean>(
    "instantiate",
    "Instantiate the smart account by a small transfer",
    true,
    types.boolean
  )
  .setAction(async ({ instantiate }, hre) => {
    const owner = privateKeyToAccount(PRIVATE_KEY);

    const testClient = createTestClient({
      transport: http(NODE_URL),
      chain: foundry,
      mode: "anvil",
    });

    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(NODE_URL),
    });

    const entryPoint = {
      address: entryPoint07Address,
      version: "0.7",
    } as const;

    const pimlicoClient = createPimlicoClient({
      chain: foundry,
      transport: http(BUNDLER_URL),
      entryPoint,
    });

    // const smartAccount = await toSimpleSmartAccount({
    //   client: publicClient,
    //   owner,
    //   entryPoint,
    // });
    const smartAccount = await toSafeSmartAccount({
      client: publicClient,
      entryPoint,
      owners: [owner],
      saltNonce: 0n, // optional
      version: "1.4.1",
      // safe4337ModuleAddress: SAFE_4337_MODULE_ADDR,
      // erc7579LaunchpadAddress: ERC_7579_LAUNCHPAD_ADDR,
    });

    // Set the balance
    await testClient.setBalance({
      address: smartAccount.address,
      value: parseEther("100"),
    });

    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: foundry,
      bundlerTransport: http(BUNDLER_URL),
      userOperation: {
        estimateFeesPerGas: async () => {
          return (await pimlicoClient.getUserOperationGasPrice()).fast;
        },
      },
    }).extend(erc7579Actions());

    if (instantiate) {
      process.stdout.write("Transferring to Bob to instantiate the smart account...");
      const bob = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const txHash = await smartAccountClient.sendTransaction({
        to: bob,
        value: parseEther("0.01"),
      });
      console.log("done");
    }

    return { pimlicoClient, publicClient, smartAccount, smartAccountClient, testClient };
  });
