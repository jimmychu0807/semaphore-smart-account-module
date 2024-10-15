import { task, types } from "hardhat/config";

/**
 * Defines a Hardhat task to deploy the Semaphore contract.
 * This task handles the deployment of dependent contracts like SemaphoreVerifier and PoseidonT3 if not provided.
 */
task("deploy:semaphore", "Deploy a Semaphore contract")
  .addOptionalParam<string>(
    "semaphoreVerifier",
    "SemaphoreVerifier contract address",
    undefined,
    types.string
  )
  .addOptionalParam<string>("poseidon", "Poseidon library address", undefined, types.string)
  .addOptionalParam<boolean>("logs", "Print the logs", true, types.boolean)
  .setAction(
    async (
      { logs, semaphoreVerifier: semaphoreVerifierAddress, poseidon: poseidonAddress },
      { viem, run }
    ): Promise<any> => {
      // Deploy SemaphoreVerifier if not provided.
      if (!semaphoreVerifierAddress) {
        const { semaphoreVerifier } = await run("deploy:semaphore-verifier");
        semaphoreVerifierAddress = semaphoreVerifier.address;
      }

      // Deploy PoseidonT3 if not provided.
      if (!poseidonAddress) {
        const poseidonT3 = await viem.deployContract("PoseidonT3");
        poseidonAddress = poseidonT3.address;
        logs && console.info(`Poseidon library has been deployed to: ${poseidonAddress}`);
      }

      const semaphore = await viem.deployContract("Semaphore", [poseidonAddress], {
        libraries: {
          PoseidonT3: poseidonAddress,
        },
      });
      logs && console.info(`Semaphore contract has been deployed to: ${semaphore.address}`);

      return {
        semaphore,
        semaphoreVerifierAddress,
        poseidonAddress,
      };
    }
  );

/**
 * Defines a Hardhat task to deploy the SemaphoreVerifier contract.
 * This task can optionally log the deployment address.
 */
task("deploy:semaphore-verifier", "Deploy a SemaphoreVerifier contract")
  .addOptionalParam<boolean>("logs", "Print the logs", true, types.boolean)
  .setAction(async ({ logs }, { viem }): Promise<any> => {
    const semaphoreVerifier = await viem.deployContract("SemaphoreVerifier");
    logs &&
      console.info(`SemaphoreVerifier contract has been deployed to: ${semaphoreVerifier.address}`);
    return { semaphoreVerifier };
  });
