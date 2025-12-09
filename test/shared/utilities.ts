import { ethers } from "hardhat"

const TEN_TO_18 = BigInt(1000000000000000000) // 10^18

export function expandTo18Decimals(n: number): bigint {
  return BigInt(n) * TEN_TO_18
}

export function getCreate2Address(
  factoryAddress: string,
  [tokenA, tokenB]: [string, string],
  bytecode: string
): string {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    ethers.keccak256(ethers.solidityPacked(['address', 'address'], [token0, token1])),
    ethers.keccak256(bytecode)
  ]
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return ethers.getAddress(`0x${ethers.keccak256(sanitizedInputs).slice(-40)}`)
}

// 2^112 as a constant (UQ112x112 fixed point format used by Uniswap)
const TWO_POW_112 = BigInt(5192296858534827628530496329220096)

export function encodePrice(reserve0: bigint, reserve1: bigint): [bigint, bigint] {
  return [
    (reserve1 * TWO_POW_112) / reserve0,
    (reserve0 * TWO_POW_112) / reserve1
  ]
}
