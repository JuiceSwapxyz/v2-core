import { ethers } from "hardhat"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { Contract } from "ethers"

import { expandTo18Decimals } from './utilities'

interface FactoryFixture {
  factory: Contract
}

export async function factoryFixture([wallet]: HardhatEthersSigner[]): Promise<FactoryFixture> {
  const Factory = await ethers.getContractFactory("UniswapV2Factory")
  const factory = await Factory.deploy(wallet.address)
  return { factory }
}

interface PairFixture extends FactoryFixture {
  token0: Contract
  token1: Contract
  pair: Contract
}

export async function pairFixture([wallet]: HardhatEthersSigner[]): Promise<PairFixture> {
  const { factory } = await factoryFixture([wallet])

  const ERC20 = await ethers.getContractFactory("ERC20")
  const tokenA = await ERC20.deploy(expandTo18Decimals(10000))
  const tokenB = await ERC20.deploy(expandTo18Decimals(10000))

  await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress())
  const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress())

  const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair")
  const pair = UniswapV2Pair.attach(pairAddress).connect(wallet) as Contract

  const token0Address = await pair.token0()
  const token0 = (await tokenA.getAddress()) === token0Address ? tokenA : tokenB
  const token1 = (await tokenA.getAddress()) === token0Address ? tokenB : tokenA

  return { factory, token0, token1, pair }
}
