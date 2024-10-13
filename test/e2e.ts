import { expect } from "chai";
import hre, { run, ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { Semaphore, SemaphoreAccountFactory, SemaphoreAccount__factory } from "../typechain-types";
import { AbiCoder, Contract, Signer, Provider, formatEther, concat, parseEther } from "ethers";
import { generateProof } from "@semaphore-protocol/proof";
import { UserOperation, getUserOpHash, transformToSend } from "./helpers";
import { IEntryPoint__factory, getEntryPointAddress } from "@account-abstraction/utils";

// Based on https://github.com/eth-infinitism/bundler#running-local-node
const BUNDLER_URL = "http://localhost:3000/rpc";
const ENTRYPOINT_ADDRESS = getEntryPointAddress();
console.log("EntryPoint contract:", ENTRYPOINT_ADDRESS);

const wasmFilePath = `snark-artifacts/semaphore.wasm`;
const zkeyFilePath = `snark-artifacts/semaphore.zkey`;
const merkleTreeDepth = 10;

describe("#e2e", () => {
  let ethersProvider: Provider;
  let ethersSigner: Signer;
  let accounts: string[];

  let semaphoreContract: Semaphore;
  let factoryContract: SemaphoreAccountFactory;
  let identity: Identity;
  let defaultAbiCoder: AbiCoder;
  let group: Group;
  let groupId: number;

  before(async () => {
    ethersProvider = ethers.provider;
    accounts = (await ethers.getSigners()).map((s) => s.address);
    ethersSigner = await ethers.getSigner(accounts[0]);
    defaultAbiCoder = AbiCoder.defaultAbiCoder();

    // Deploy semaphore contract to local network
    ({ semaphore: semaphoreContract } = (await run("deploy:semaphore")) as {
      semaphore: Semaphore;
    });

    // Create new semaphore on-chain group
    groupId = 0;
    semaphoreContract = semaphoreContract.connect(ethersSigner);

    await semaphoreContract.createGroup();

    // Generate new semaphore identity and add to group
    identity = new Identity();
    group = new Group([identity.commitment, 3n, 4n]);
    await semaphoreContract.addMembers(groupId, group.members);

    // Deploy account factory
    const factory = await ethers.getContractFactory("SemaphoreAccountFactory", ethersSigner);
    factoryContract = await factory.deploy(
      ENTRYPOINT_ADDRESS,
      await semaphoreContract.getAddress()
    );

    console.log("Factory address:", await factoryContract.getAddress());
  });

  it("should send UserOp to the bundler to have the wallet created and transfer some eth", async () => {
    const salt = Math.round(Math.random() * 100000);
    // Note: there is a conflict between the ethers BaseContract getAddress() and the smart contract function
    const getAddrOnchain = factoryContract.getFunction("getAddress");
    const walletAddress = await getAddrOnchain.staticCall(groupId, salt);
    console.log("Counterfactual Wallet address:", walletAddress);

    // Transfer 1ETH to the future account
    await ethersSigner.sendTransaction({
      from: accounts[0],
      to: walletAddress,
      value: parseEther("1"),
    });
    const initialBalance = await ethersProvider.getBalance(walletAddress);

    const entrypointContract = new Contract(
      ENTRYPOINT_ADDRESS,
      IEntryPoint__factory.abi,
      ethersSigner
    );

    // Add some deposit in entry point contract for the wallet
    // This is optional - if there is no deposit, then wallet need to pay the fee from the wallet balance
    // If deposit is positive, entry point deduct from that
    await entrypointContract.depositTo(walletAddress, {
      value: parseEther("1"),
    });

    // Our wallet access external contract storage slots (Semaphore data)
    // Factory contract creating such wallets needs to add a stake to prevent abuse
    await factoryContract.addStake(24 * 60 * 60, { value: parseEther("2") });

    // Create a random wallet and use our contract wallet to send money to that
    const randomWallet = ethers.Wallet.createRandom();
    const transferAmount = parseEther("0.2");
    const transferEthCallData = SemaphoreAccount__factory.createInterface().encodeFunctionData(
      "execute",
      [
        randomWallet.address, // recipient
        transferAmount, // amount
        "0x", // no need of data
      ]
    );

    // Create UserOp
    const userOp = {
      sender: walletAddress,
      nonce: 0n, // TODO: dynamically fetch user nonce here
      initCode: concat([
        await factoryContract.getAddress(),
        factoryContract.interface.encodeFunctionData("createAccount", [groupId, salt]),
      ]),
      callData: transferEthCallData,
      callGasLimit: 2000000n,
      verificationGasLimit: 1000000n,
      maxFeePerGas: BigInt(3e9),
      preVerificationGas: 50000n,
      maxPriorityFeePerGas: BigInt(1e9),
      paymasterAndData: "0x",
      signature: "0x", // This will be changed later
    };

    const chainId = await ethers.provider.getNetwork().then((net) => net.chainId);
    const userOpHash = await getUserOpHash(userOp, ENTRYPOINT_ADDRESS, Number(chainId));

    // Generate proof of membership
    const externalNullifier = 0n; // Not needed - 0 used in the contract
    const signal = userOpHash; // Hash of UserOperation is the signal

    const fullProof = await generateProof(
      identity,
      group,
      externalNullifier,
      signal,
      merkleTreeDepth,
      {
        wasm: wasmFilePath,
        zkey: zkeyFilePath,
      }
    );

    // Encode proof and inputs as signature
    userOp.signature = defaultAbiCoder.encode(
      ["uint256[8]", "uint256", "uint256", "uint256"],
      [fullProof.points, fullProof.merkleTreeRoot, merkleTreeDepth, fullProof.nullifier]
    );

    // Send UserOp to the bundler
    const responseRaw = await fetch(BUNDLER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "eth_sendUserOperation",
        params: [transformToSend(userOp), ENTRYPOINT_ADDRESS],
      }),
    });

    const response = await responseRaw.json();
    console.log("Bundler response", response);

    expect(response.result).to.be.equal(userOpHash);

    // Sleep for 5 seconds - for the Bundler to send UserOp to the network
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Wallet contract should have been created
    expect(await ethersProvider.getCode(walletAddress)).to.not.be.equal("0x");

    const currentWalletBalance = formatEther(await ethersProvider.getBalance(walletAddress));
    const randomWalletBalance = formatEther(await ethersProvider.getBalance(randomWallet.address));

    // Balance of wallet should be 0.8 ETH (1 - 0.2)
    expect(currentWalletBalance).to.be.equal(formatEther(initialBalance.sub(transferAmount)));

    // Balance of random wallet should be 0.2 ETH
    expect(randomWalletBalance).to.be.equal(formatEther(transferAmount));
  });
});
