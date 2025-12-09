import { expect } from "chai"
import { ethers } from "hardhat"
import { Contract, Signature } from "ethers"
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"

import { expandTo18Decimals } from './shared/utilities'

const TOTAL_SUPPLY = expandTo18Decimals(10000)
const TEST_AMOUNT = expandTo18Decimals(10)

describe('UniswapV2ERC20', () => {
  let wallet: HardhatEthersSigner
  let other: HardhatEthersSigner

  async function fixture() {
    const ERC20 = await ethers.getContractFactory("ERC20")
    const token = await ERC20.deploy(TOTAL_SUPPLY)
    return { token }
  }

  beforeEach(async () => {
    [wallet, other] = await ethers.getSigners()
  })

  it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
    const { token } = await loadFixture(fixture)
    const name = await token.name()
    expect(name).to.eq('JuiceSwap V2')
    expect(await token.symbol()).to.eq('JUICE-V2')
    expect(await token.decimals()).to.eq(18)
    expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY)
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY)

    const { chainId } = await ethers.provider.getNetwork()
    expect(await token.DOMAIN_SEPARATOR()).to.eq(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [
            ethers.keccak256(
              ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
            ),
            ethers.keccak256(ethers.toUtf8Bytes(name)),
            ethers.keccak256(ethers.toUtf8Bytes('1')),
            chainId,
            await token.getAddress()
          ]
        )
      )
    )
    expect(await token.PERMIT_TYPEHASH()).to.eq(
      ethers.keccak256(ethers.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
    )
  })

  it('approve', async () => {
    const { token } = await loadFixture(fixture)
    await expect(token.approve(other.address, TEST_AMOUNT))
      .to.emit(token, 'Approval')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer', async () => {
    const { token } = await loadFixture(fixture)
    await expect(token.transfer(other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY - TEST_AMOUNT)
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('transfer:fail', async () => {
    const { token } = await loadFixture(fixture)
    await expect(token.transfer(other.address, TOTAL_SUPPLY + 1n)).to.be.reverted // ds-math-sub-underflow
    await expect(token.connect(other).transfer(wallet.address, 1)).to.be.reverted // ds-math-sub-underflow
  })

  it('transferFrom', async () => {
    const { token } = await loadFixture(fixture)
    await token.approve(other.address, TEST_AMOUNT)
    await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(wallet.address, other.address)).to.eq(0)
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY - TEST_AMOUNT)
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('transferFrom:max', async () => {
    const { token } = await loadFixture(fixture)
    await token.approve(other.address, ethers.MaxUint256)
    await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(wallet.address, other.address)).to.eq(ethers.MaxUint256)
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY - TEST_AMOUNT)
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT)
  })

  it('permit', async () => {
    const { token } = await loadFixture(fixture)
    const tokenAddress = await token.getAddress()
    const nonce = await token.nonces(wallet.address)
    const deadline = ethers.MaxUint256
    const { chainId } = await ethers.provider.getNetwork()

    // EIP-712 typed data
    const domain = {
      name: 'JuiceSwap V2',
      version: '1',
      chainId: chainId,
      verifyingContract: tokenAddress
    }

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    }

    const value = {
      owner: wallet.address,
      spender: other.address,
      value: TEST_AMOUNT,
      nonce: nonce,
      deadline: deadline
    }

    const signature = await wallet.signTypedData(domain, types, value)
    const { v, r, s } = Signature.from(signature)

    await expect(token.permit(wallet.address, other.address, TEST_AMOUNT, deadline, v, r, s))
      .to.emit(token, 'Approval')
      .withArgs(wallet.address, other.address, TEST_AMOUNT)
    expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT)
    expect(await token.nonces(wallet.address)).to.eq(1n)
  })
})
