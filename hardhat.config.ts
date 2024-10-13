import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "solidity-coverage";

import "./tasks/deploy-semaphore";
import "./tasks/deploy-erc7579-accounts";

const config: HardhatUserConfig = {
  solidity: "0.8.23",
};

export default config;
