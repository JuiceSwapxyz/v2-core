import { expect } from "chai"
import { ethers } from "hardhat"
import { Contract } from "ethers"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"

import { getCreate2Address } from './shared/utilities'
import { factoryFixture } from './shared/fixtures'

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000'
]

describe('UniswapV2Factory', () => {
  let wallet: HardhatEthersSigner
  let other: HardhatEthersSigner

  async function fixture() {
    const signers = await ethers.getSigners()
    return factoryFixture(signers)
  }

  beforeEach(async () => {
    [wallet, other] = await ethers.getSigners()
  })

  it('feeTo, feeToSetter, allPairsLength', async () => {
    const { factory } = await loadFixture(fixture)
    expect(await factory.feeTo()).to.eq(ethers.ZeroAddress)
    expect(await factory.feeToSetter()).to.eq(wallet.address)
    expect(await factory.allPairsLength()).to.eq(0)
  })

  async function createPair(factory: Contract, tokens: [string, string]) {
    const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair")
    const bytecode = UniswapV2Pair.bytecode
    const create2Address = getCreate2Address(await factory.getAddress(), tokens, bytecode)

    await expect(factory.createPair(...tokens))
      .to.emit(factory, 'PairCreated')
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, 1n)

    await expect(factory.createPair(...tokens)).to.be.reverted // UniswapV2: PAIR_EXISTS
    await expect(factory.createPair(...(tokens.slice().reverse() as [string, string]))).to.be.reverted // UniswapV2: PAIR_EXISTS
    expect(await factory.getPair(...tokens)).to.eq(create2Address)
    expect(await factory.getPair(...(tokens.slice().reverse() as [string, string]))).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(await factory.allPairsLength()).to.eq(1)

    const pair = UniswapV2Pair.attach(create2Address)
    expect(await pair.factory()).to.eq(await factory.getAddress())
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0])
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1])
  }

  it('createPair', async () => {
    const { factory } = await loadFixture(fixture)
    await createPair(factory, TEST_ADDRESSES)
  })

  it('createPair:reverse', async () => {
    const { factory } = await loadFixture(fixture)
    await createPair(factory, TEST_ADDRESSES.slice().reverse() as [string, string])
  })

  it('createPair:gas', async () => {
    const { factory } = await loadFixture(fixture)
    const tx = await factory.createPair(...TEST_ADDRESSES)
    const receipt = await tx.wait()
    // Note: Gas value may differ slightly between Hardhat and Ganache
    // Original value was 2512920, adjust if needed
    expect(receipt.gasUsed).to.be.closeTo(2512920n, 50000n)
  })

  it('setFeeTo', async () => {
    const { factory } = await loadFixture(fixture)
    await expect(factory.connect(other).setFeeTo(other.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setFeeTo(wallet.address)
    expect(await factory.feeTo()).to.eq(wallet.address)
  })

  it('setFeeToSetter', async () => {
    const { factory } = await loadFixture(fixture)
    await expect(factory.connect(other).setFeeToSetter(other.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setFeeToSetter(other.address)
    expect(await factory.feeToSetter()).to.eq(other.address)
    await expect(factory.setFeeToSetter(wallet.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
  })
})
