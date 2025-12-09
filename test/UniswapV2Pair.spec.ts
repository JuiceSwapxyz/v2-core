import { expect } from "chai"
import { ethers } from "hardhat"
import { Contract } from "ethers"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"

import { expandTo18Decimals, encodePrice } from './shared/utilities'
import { pairFixture } from './shared/fixtures'

const MINIMUM_LIQUIDITY = 1000n

describe('UniswapV2Pair', () => {
  let wallet: HardhatEthersSigner
  let other: HardhatEthersSigner

  async function fixture() {
    const signers = await ethers.getSigners()
    return pairFixture(signers)
  }

  beforeEach(async () => {
    [wallet, other] = await ethers.getSigners()
  })

  it('mint', async () => {
    const { pair, token0, token1 } = await loadFixture(fixture)
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await token0.transfer(await pair.getAddress(), token0Amount)
    await token1.transfer(await pair.getAddress(), token1Amount)

    const expectedLiquidity = expandTo18Decimals(2)
    await expect(pair.mint(wallet.address))
      .to.emit(pair, 'Transfer')
      .withArgs(ethers.ZeroAddress, ethers.ZeroAddress, MINIMUM_LIQUIDITY)
      .to.emit(pair, 'Transfer')
      .withArgs(ethers.ZeroAddress, wallet.address, expectedLiquidity - MINIMUM_LIQUIDITY)
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount, token1Amount)
      .to.emit(pair, 'Mint')
      .withArgs(wallet.address, token0Amount, token1Amount)

    expect(await pair.totalSupply()).to.eq(expectedLiquidity)
    expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity - MINIMUM_LIQUIDITY)
    expect(await token0.balanceOf(await pair.getAddress())).to.eq(token0Amount)
    expect(await token1.balanceOf(await pair.getAddress())).to.eq(token1Amount)
    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount)
    expect(reserves[1]).to.eq(token1Amount)
  })

  async function addLiquidity(pair: Contract, token0: Contract, token1: Contract, token0Amount: bigint, token1Amount: bigint) {
    await token0.transfer(await pair.getAddress(), token0Amount)
    await token1.transfer(await pair.getAddress(), token1Amount)
    await pair.mint(wallet.address)
  }

  const swapTestCases: bigint[][] = [
    [1, 5, 10, 1662497915624478906n],
    [1, 10, 5, 453305446940074565n],
    [2, 5, 10, 2851015155847869602n],
    [2, 10, 5, 831248957812239453n],
    [1, 10, 10, 906610893880149131n],
    [1, 100, 100, 987158034397061298n],
    [1, 1000, 1000, 996006981039903216n]
  ].map(a => a.map((n, i) => i < 3 ? expandTo18Decimals(Number(n)) : n))

  swapTestCases.forEach((swapTestCase, i) => {
    it(`getInputPrice:${i}`, async () => {
      const { pair, token0, token1 } = await loadFixture(fixture)
      const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
      await addLiquidity(pair, token0, token1, token0Amount, token1Amount)
      await token0.transfer(await pair.getAddress(), swapAmount)
      await expect(pair.swap(0, expectedOutputAmount + 1n, wallet.address, '0x')).to.be.revertedWith(
        'UniswapV2: K'
      )
      await pair.swap(0, expectedOutputAmount, wallet.address, '0x')
    })
  })

  // Test the K invariant edge cases - testing fee boundary behavior
  // 0.997 = 1 - 0.3% fee, so 997000000000000000 is the maximum output for 1e18 input
  const optimisticTestCases: bigint[][] = [
    [997000000000000000n, expandTo18Decimals(5), expandTo18Decimals(10), expandTo18Decimals(1)], // given amountIn, amountOut = floor(amountIn * .997)
    [997000000000000000n, expandTo18Decimals(10), expandTo18Decimals(5), expandTo18Decimals(1)],
    [997000000000000000n, expandTo18Decimals(5), expandTo18Decimals(5), expandTo18Decimals(1)],
    [expandTo18Decimals(1), expandTo18Decimals(5), expandTo18Decimals(5), 1003009027081243732n] // given amountOut, amountIn = ceiling(amountOut / .997)
  ]

  optimisticTestCases.forEach((optimisticTestCase, i) => {
    it(`optimistic:${i}`, async () => {
      const { pair, token0, token1 } = await loadFixture(fixture)
      const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
      await addLiquidity(pair, token0, token1, token0Amount, token1Amount)
      await token0.transfer(await pair.getAddress(), inputAmount)
      await expect(pair.swap(outputAmount + 1n, 0, wallet.address, '0x')).to.be.revertedWith(
        'UniswapV2: K'
      )
      await pair.swap(outputAmount, 0, wallet.address, '0x')
    })
  })

  it('swap:token0', async () => {
    const { pair, token0, token1 } = await loadFixture(fixture)
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(pair, token0, token1, token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = 1662497915624478906n
    await token0.transfer(await pair.getAddress(), swapAmount)
    await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0x'))
      .to.emit(token1, 'Transfer')
      .withArgs(await pair.getAddress(), wallet.address, expectedOutputAmount)
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount + swapAmount, token1Amount - expectedOutputAmount)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount + swapAmount)
    expect(reserves[1]).to.eq(token1Amount - expectedOutputAmount)
    expect(await token0.balanceOf(await pair.getAddress())).to.eq(token0Amount + swapAmount)
    expect(await token1.balanceOf(await pair.getAddress())).to.eq(token1Amount - expectedOutputAmount)
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0 - token0Amount - swapAmount)
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1 - token1Amount + expectedOutputAmount)
  })

  it('swap:token1', async () => {
    const { pair, token0, token1 } = await loadFixture(fixture)
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(pair, token0, token1, token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = 453305446940074565n
    await token1.transfer(await pair.getAddress(), swapAmount)
    await expect(pair.swap(expectedOutputAmount, 0, wallet.address, '0x'))
      .to.emit(token0, 'Transfer')
      .withArgs(await pair.getAddress(), wallet.address, expectedOutputAmount)
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount - expectedOutputAmount, token1Amount + swapAmount)
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, 0, swapAmount, expectedOutputAmount, 0, wallet.address)

    const reserves = await pair.getReserves()
    expect(reserves[0]).to.eq(token0Amount - expectedOutputAmount)
    expect(reserves[1]).to.eq(token1Amount + swapAmount)
    expect(await token0.balanceOf(await pair.getAddress())).to.eq(token0Amount - expectedOutputAmount)
    expect(await token1.balanceOf(await pair.getAddress())).to.eq(token1Amount + swapAmount)
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0 - token0Amount + expectedOutputAmount)
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1 - token1Amount - swapAmount)
  })

  it('swap:gas', async () => {
    const { pair, token0, token1 } = await loadFixture(fixture)
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(pair, token0, token1, token0Amount, token1Amount)

    // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    const blockTimestamp = Number((await pair.getReserves())[2])
    await time.increaseTo(blockTimestamp + 1)
    await pair.sync()

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = 453305446940074565n
    await token1.transfer(await pair.getAddress(), swapAmount)
    await time.increase(1)
    const tx = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')
    const receipt = await tx.wait()
    // Note: Gas value may differ slightly between Hardhat and Ganache
    // Original value was 73462, adjust if needed
    expect(receipt.gasUsed).to.be.closeTo(73462n, 5000n)
  })

  it('burn', async () => {
    const { pair, token0, token1 } = await loadFixture(fixture)
    const token0Amount = expandTo18Decimals(3)
    const token1Amount = expandTo18Decimals(3)
    await addLiquidity(pair, token0, token1, token0Amount, token1Amount)

    const expectedLiquidity = expandTo18Decimals(3)
    await pair.transfer(await pair.getAddress(), expectedLiquidity - MINIMUM_LIQUIDITY)
    await expect(pair.burn(wallet.address))
      .to.emit(pair, 'Transfer')
      .withArgs(await pair.getAddress(), ethers.ZeroAddress, expectedLiquidity - MINIMUM_LIQUIDITY)
      .to.emit(token0, 'Transfer')
      .withArgs(await pair.getAddress(), wallet.address, token0Amount - 1000n)
      .to.emit(token1, 'Transfer')
      .withArgs(await pair.getAddress(), wallet.address, token1Amount - 1000n)
      .to.emit(pair, 'Sync')
      .withArgs(1000, 1000)
      .to.emit(pair, 'Burn')
      .withArgs(wallet.address, token0Amount - 1000n, token1Amount - 1000n, wallet.address)

    expect(await pair.balanceOf(wallet.address)).to.eq(0)
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
    expect(await token0.balanceOf(await pair.getAddress())).to.eq(1000)
    expect(await token1.balanceOf(await pair.getAddress())).to.eq(1000)
    const totalSupplyToken0 = await token0.totalSupply()
    const totalSupplyToken1 = await token1.totalSupply()
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0 - 1000n)
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1 - 1000n)
  })

  it('price{0,1}CumulativeLast', async () => {
    const { pair, token0, token1 } = await loadFixture(fixture)
    const token0Amount = expandTo18Decimals(3)
    const token1Amount = expandTo18Decimals(3)
    await addLiquidity(pair, token0, token1, token0Amount, token1Amount)

    const blockTimestamp = Number((await pair.getReserves())[2])
    // Use setNextBlockTimestamp to precisely control timing
    await time.setNextBlockTimestamp(blockTimestamp + 1)
    await pair.sync()

    const initialPrice = encodePrice(token0Amount, token1Amount)
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0])
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1])
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 1)

    const swapAmount = expandTo18Decimals(3)
    await token0.transfer(await pair.getAddress(), swapAmount)
    await time.setNextBlockTimestamp(blockTimestamp + 10)
    // swap to a new price eagerly instead of syncing
    await pair.swap(0, expandTo18Decimals(1), wallet.address, '0x') // make the price nice

    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0] * 10n)
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1] * 10n)
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 10)

    await time.setNextBlockTimestamp(blockTimestamp + 20)
    await pair.sync()

    const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0] * 10n + newPrice[0] * 10n)
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1] * 10n + newPrice[1] * 10n)
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 20)
  })

  it('feeTo:off', async () => {
    const { factory, pair, token0, token1 } = await loadFixture(fixture)
    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(pair, token0, token1, token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = 996006981039903216n
    await token1.transfer(await pair.getAddress(), swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')

    const expectedLiquidity = expandTo18Decimals(1000)
    await pair.transfer(await pair.getAddress(), expectedLiquidity - MINIMUM_LIQUIDITY)
    await pair.burn(wallet.address)
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
  })

  it('feeTo:on', async () => {
    const { factory, pair, token0, token1 } = await loadFixture(fixture)
    await factory.setFeeTo(other.address)

    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(pair, token0, token1, token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = 996006981039903216n
    await token1.transfer(await pair.getAddress(), swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')

    const expectedLiquidity = expandTo18Decimals(1000)
    await pair.transfer(await pair.getAddress(), expectedLiquidity - MINIMUM_LIQUIDITY)
    await pair.burn(wallet.address)
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY + 249750499251388n)
    expect(await pair.balanceOf(other.address)).to.eq(249750499251388n)

    // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
    // ...because the initial liquidity amounts were equal
    expect(await token0.balanceOf(await pair.getAddress())).to.eq(1000n + 249501683697445n)
    expect(await token1.balanceOf(await pair.getAddress())).to.eq(1000n + 250000187312969n)
  })
})
