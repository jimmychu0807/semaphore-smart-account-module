import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";

import "./tasks/deploy";

const config: HardhatUserConfig = {
  solidity: "0.8.23",
};

export default config;
