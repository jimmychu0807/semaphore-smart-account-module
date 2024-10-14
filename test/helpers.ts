import { AbiCoder, BigNumberish, BytesLike, keccak256 } from "ethers";
import { createBundlerClient } from "viem/account-abstraction";
import { http } from "viem";
import { foundry } from "viem/chains";

import { BUNDLER_URL, PAYMASTER_URL } from "../config";

export interface UserOperation {
  sender: string;
  nonce: BigNumberish;
  initCode: BytesLike;
  callData: BytesLike;
  callGasLimit: BigNumberish;
  verificationGasLimit: BigNumberish;
  preVerificationGas: BigNumberish;
  maxFeePerGas: BigNumberish;
  maxPriorityFeePerGas: BigNumberish;
  paymasterAndData: BytesLike;
  signature: BytesLike;
}

const defaultAbiCoder = AbiCoder.defaultAbiCoder();

export function transformToSend(userOp: UserOperation) {
  const {
    sender,
    nonce,
    initCode,
    callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymasterAndData,
    signature,
  } = userOp;

  return {
    sender,
    nonce: `0x${nonce.toString(16)}`,
    initCode,
    callData,
    callGasLimit: `0x${callGasLimit.toString(16)}`,
    verificationGasLimit: `0x${verificationGasLimit.toString(16)}`,
    preVerificationGas: `0x${preVerificationGas.toString(16)}`,
    maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
    paymasterAndData,
    signature,
  };
}

export function packUserOp(op: UserOperation, forSignature = true): string {
  if (forSignature) {
    return defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "bytes32",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ],
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        op.callGasLimit,
        op.verificationGasLimit,
        op.preVerificationGas,
        op.maxFeePerGas,
        op.maxPriorityFeePerGas,
        keccak256(op.paymasterAndData),
      ]
    );
  } else {
    // for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
    return defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "bytes",
        "bytes",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes",
        "bytes",
      ],
      [
        op.sender,
        op.nonce,
        op.initCode,
        op.callData,
        op.callGasLimit,
        op.verificationGasLimit,
        op.preVerificationGas,
        op.maxFeePerGas,
        op.maxPriorityFeePerGas,
        op.paymasterAndData,
        op.signature,
      ]
    );
  }
}

export function getUserOpHash(op: UserOperation, entryPoint: string, chainId: number): string {
  const userOpHash = keccak256(packUserOp(op, true));
  const enc = defaultAbiCoder.encode(
    ["bytes32", "address", "uint256"],
    [userOpHash, entryPoint, chainId]
  );
  return keccak256(enc);
}

// ref: https://docs.pimlico.io/permissionless/how-to/local-testing
export async function ensureBundlerIsReady() {
  const bundlerClient = createBundlerClient({
    chain: foundry,
    transport: http(BUNDLER_URL),
  });

  while (true) {
    try {
      await bundlerClient.getChainId();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export async function ensurePaymasterIsReady() {
  while (true) {
    try {
      // mock paymaster will open up this endpoint when ready
      const res = await fetch(`${PAYMASTER_URL}/ping`);
      const data = await res.json();
      if (data.message !== "pong") {
        throw new Error("paymaster not ready yet");
      }

      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
