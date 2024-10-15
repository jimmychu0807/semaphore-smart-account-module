import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { encodePacked, parseEther } from "viem";

import { ensureBundlerIsReady, ensurePaymasterIsReady } from "./helpers";

describe("Semaphore Smart Account Module", function () {
  before(async () => {
    await ensureBundlerIsReady();
    await ensurePaymasterIsReady();
  });

  async function smartAccountSetup() {
    const result = await hre.run("deploy:erc7579");
    return result;
  }

  it("should be able to install the Semaphore smart account module", async function () {
    const { publicClient, smartAccount, smartAccountClient, pimlicoClient } =
      await loadFixture(smartAccountSetup);

    const bal = await publicClient.getBalance({ address: smartAccount.address });
    console.log(`smartAccount addr: ${smartAccount.address}, with bal: ${bal}`);

    const accountId = await smartAccountClient.accountId();
    console.log("smartAccount client AcctId:", accountId);

    const ownableExecutorModule = "0xc98B026383885F41d9a995f85FC480E9bb8bB891";
    const moduleData = encodePacked(["address"], ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"]);
    console.log("moduleData:", moduleData);

    const userOpHash = await smartAccountClient.installModule({
      type: "executor",
      address: ownableExecutorModule,
      context: moduleData,
    });
    console.log("userOpHash:", userOpHash);

    const receipt = await pimlicoClient.waitForUserOperationReceipt({ hash: userOpHash });
    console.log("receipt:", receipt);
  });
});
