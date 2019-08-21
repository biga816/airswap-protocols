const Peer = artifacts.require('Peer')
const Swap = artifacts.require('Swap')
const MockContract = artifacts.require('MockContract')
const {
  equal,
  passes,
  emitted,
  reverted,
} = require('@airswap/test-utils').assert
const { takeSnapshot, revertToSnapShot } = require('@airswap/test-utils').time
const { EMPTY_ADDRESS } = require('@airswap/order-utils').constants

contract('Peer Unit Tests', async accounts => {
  const owner = accounts[0]
  const notOwner = accounts[2]
  let peer
  let mockSwap
  let snapshotId
  let swap_swapSimple
  const PEER_TOKEN = accounts[9]
  const CONSUMER_TOKEN = accounts[8]
  const MAX_PEER_AMOUNT = 12345
  const PRICE_COEF = 4321
  const EXP = 2

  beforeEach(async () => {
    let snapShot = await takeSnapshot()
    snapshotId = snapShot['result']
  })

  afterEach(async () => {
    await revertToSnapShot(snapshotId)
  })

  async function setupMockSwap() {
    let swapTemplate = await Swap.new()
    swap_swapSimple = swapTemplate.contract.methods
      .swapSimple(
        0,
        0,
        EMPTY_ADDRESS,
        0,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        0,
        EMPTY_ADDRESS,
        8,
        web3.utils.asciiToHex('r'),
        web3.utils.asciiToHex('s')
      )
      .encodeABI()

    mockSwap = await MockContract.new()
  }

  before('deploy Peer', async () => {
    await setupMockSwap()
    peer = await Peer.new(mockSwap.address, EMPTY_ADDRESS, { from: owner })
  })

  describe('Test initial values', async () => {
    it('Test initial Swap Contract', async () => {
      let val = await peer.swapContract.call()
      equal(val, mockSwap.address, 'swap address is incorrect')
    })

    it('Test owner is set correctly if provided the empty address', async () => {
      // being provided an empty address, it should leave the owner unchanged
      let val = await peer.owner.call()
      equal(val, owner, 'owner is incorrect - should be owner')
    })

    it('Test owner is set correctly if provided an address', async () => {
      let newPeer = await Peer.new(mockSwap.address, notOwner, { from: owner })

      // being provided an empty address, it should leave the owner unchanged
      let val = await newPeer.owner.call()
      equal(val, notOwner, 'owner is incorrect - should be notOwner')
    })
  })

  describe('Test setters', async () => {
    it('Test setRule permissions', async () => {
      await reverted(
        peer.setRule(
          PEER_TOKEN,
          CONSUMER_TOKEN,
          MAX_PEER_AMOUNT,
          PRICE_COEF,
          EXP,
          { from: notOwner }
        )
      )

      await passes(
        peer.setRule(
          PEER_TOKEN,
          CONSUMER_TOKEN,
          MAX_PEER_AMOUNT,
          PRICE_COEF,
          EXP,
          { from: owner }
        )
      )
    })

    it('Test setRule', async () => {
      let trx = await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      //check if rule has been added
      let rule = await peer.rules.call(PEER_TOKEN, CONSUMER_TOKEN)
      equal(
        rule[0].toNumber(),
        MAX_PEER_AMOUNT,
        'max peer amount is incorrectly saved'
      )
      equal(rule[1].toNumber(), PRICE_COEF, 'price coef is incorrectly saved')
      equal(rule[2].toNumber(), EXP, 'price exp is incorrectly saved')

      //check emitted event
      emitted(trx, 'SetRule', e => {
        return (
          e.peerToken === PEER_TOKEN &&
          e.consumerToken === CONSUMER_TOKEN &&
          e.maxPeerAmount.toNumber() === MAX_PEER_AMOUNT &&
          e.priceCoef.toNumber() === PRICE_COEF &&
          e.priceExp.toNumber() === EXP
        )
      })
    })

    it('Test unsetRule permissions', async () => {
      await reverted(
        peer.unsetRule(PEER_TOKEN, CONSUMER_TOKEN, { from: notOwner })
      )
      await passes(peer.unsetRule(PEER_TOKEN, CONSUMER_TOKEN, { from: owner }))
    })

    it('Test unsetRule', async () => {
      let trx = await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      //ensure rule has been added
      let ruleBefore = await peer.rules.call(PEER_TOKEN, CONSUMER_TOKEN)
      equal(
        ruleBefore[0].toNumber(),
        MAX_PEER_AMOUNT,
        'max peer amount is incorrectly saved'
      )

      trx = await peer.unsetRule(PEER_TOKEN, CONSUMER_TOKEN)

      //check that the rule has been removed
      let ruleAfter = await peer.rules.call(PEER_TOKEN, CONSUMER_TOKEN)
      equal(
        ruleAfter[0].toNumber(),
        0,
        'max delgate amount is incorrectly saved'
      )
      equal(ruleAfter[1].toNumber(), 0, 'price coef is incorrectly saved')
      equal(ruleAfter[2].toNumber(), 0, 'price exp is incorrectly saved')

      //check emitted event
      emitted(trx, 'UnsetRule', e => {
        return e.peerToken === PEER_TOKEN && e.consumerToken === CONSUMER_TOKEN
      })
    })
  })

  describe('Test getBuyQuote', async () => {
    it('test when rule does not exist', async () => {
      const NON_EXISTENT_PEER_TOKEN = accounts[7]
      let val = await peer.getBuyQuote.call(
        1234,
        NON_EXISTENT_PEER_TOKEN,
        CONSUMER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if a peer does not exist'
      )
    })

    it('test when peer amount is greater than max peer amount', async () => {
      await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )
      let val = await peer.getBuyQuote.call(
        MAX_PEER_AMOUNT + 1,
        PEER_TOKEN,
        CONSUMER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if peer amount is greater than peer max amount'
      )
    })

    it('test when peer amount is 0', async () => {
      await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )
      let val = await peer.getBuyQuote.call(0, PEER_TOKEN, CONSUMER_TOKEN)
      equal(
        val.toNumber(),
        0,
        'no quote should be available if peer amount is 0'
      )
    })

    it('test a successful call - getBuyQuote', async () => {
      await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      let val = await peer.getBuyQuote.call(1234, PEER_TOKEN, CONSUMER_TOKEN)
      let expectedValue = Math.floor((1234 * PRICE_COEF) / 10 ** EXP)
      equal(val.toNumber(), expectedValue, 'there should be a quote available')
    })
  })

  describe('Test getSellQuote', async () => {
    it('test when rule does not exist', async () => {
      let val = await peer.getSellQuote.call(4312, CONSUMER_TOKEN, PEER_TOKEN)
      equal(
        val.toNumber(),
        0,
        'no quote should be available if a peer does not exist'
      )
    })

    it('test when peer amount is not within acceptable value bounds', async () => {
      await peer.setRule(PEER_TOKEN, CONSUMER_TOKEN, 100, 1, 0)
      let val = await peer.getSellQuote.call(0, CONSUMER_TOKEN, PEER_TOKEN)
      equal(
        val.toNumber(),
        0,
        'no quote should be available if returned peer amount is 0'
      )

      val = await peer.getSellQuote.call(
        MAX_PEER_AMOUNT + 1,
        CONSUMER_TOKEN,
        PEER_TOKEN
      )
      equal(
        val.toNumber(),
        0,
        'no quote should be available if returned greater than max peer amount'
      )
    })

    it('test a successful call - getSellQuote', async () => {
      await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      let val = await peer.getSellQuote.call(500, CONSUMER_TOKEN, PEER_TOKEN)
      let expectedValue = Math.floor((500 * 10 ** EXP) / PRICE_COEF)
      equal(val.toNumber(), expectedValue, 'there should be a quote available')
    })
  })

  describe('Test getMaxQuote', async () => {
    it('test when rule does not exist', async () => {
      let val = await peer.getMaxQuote.call(PEER_TOKEN, CONSUMER_TOKEN)
      equal(
        val[0].toNumber(),
        0,
        'no quote should be available if a peer does not exist'
      )
      equal(
        val[1].toNumber(),
        0,
        'no quote should be available if a peer does not exist'
      )
    })

    it('test a successful call - getMaxQuote', async () => {
      await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )
      let val = await peer.getMaxQuote.call(PEER_TOKEN, CONSUMER_TOKEN)

      equal(
        val[0].toNumber(),
        MAX_PEER_AMOUNT,
        'no quote should be available if a peer does not exist'
      )

      let expectedValue = Math.floor((MAX_PEER_AMOUNT * PRICE_COEF) / 10 ** EXP)
      equal(
        val[1].toNumber(),
        expectedValue,
        'no quote should be available if a peer does not exist'
      )
    })
  })

  describe('Test provideOrder', async () => {
    it('test if a rule does not exist', async () => {
      await reverted(
        peer.provideOrder(
          1,
          2,
          EMPTY_ADDRESS,
          555,
          CONSUMER_TOKEN,
          EMPTY_ADDRESS,
          999,
          PEER_TOKEN,
          5,
          web3.utils.asciiToHex('r'),
          web3.utils.asciiToHex('s')
        ),
        'TOKEN_PAIR_INACTIVE'
      )
    })

    it('test if an order exceeds maximum amount', async () => {
      await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )
      await reverted(
        peer.provideOrder(
          1,
          2,
          EMPTY_ADDRESS,
          555,
          CONSUMER_TOKEN,
          EMPTY_ADDRESS,
          MAX_PEER_AMOUNT + 1,
          PEER_TOKEN,
          5,
          web3.utils.asciiToHex('r'),
          web3.utils.asciiToHex('s')
        ),
        'AMOUNT_EXCEEDS_MAX'
      )
    })

    it('test if order is priced according to the rule', async () => {
      await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )
      await reverted(
        peer.provideOrder(
          1,
          2,
          EMPTY_ADDRESS,
          30,
          CONSUMER_TOKEN,
          EMPTY_ADDRESS,
          MAX_PEER_AMOUNT,
          PEER_TOKEN,
          100,
          web3.utils.asciiToHex('r'),
          web3.utils.asciiToHex('s')
        ),
        'PRICE_INCORRECT'
      )
    })

    it('test a successful transaction with integer values', async () => {
      await peer.setRule(PEER_TOKEN, CONSUMER_TOKEN, MAX_PEER_AMOUNT, 100, EXP)

      let ruleBefore = await peer.rules.call(PEER_TOKEN, CONSUMER_TOKEN)

      let consumerAmount = 100
      await passes(
        //mock swapContract
        //test rule decrement
        peer.provideOrder(
          1, //nonce
          2, //expiry
          EMPTY_ADDRESS, //consumerWallet
          consumerAmount, //consumerAmount
          CONSUMER_TOKEN, //consumerToken
          EMPTY_ADDRESS, //peerWallet
          100, //peerAmount
          PEER_TOKEN, //peerToken
          8, //v
          web3.utils.asciiToHex('r'), //r
          web3.utils.asciiToHex('s') //s
        )
      )

      let ruleAfter = await peer.rules.call(PEER_TOKEN, CONSUMER_TOKEN)
      equal(
        ruleAfter[0].toNumber(),
        ruleBefore[0].toNumber() - consumerAmount,
        "rule's max peer amount was not decremented"
      )

      //check if swap_swapSimple() was called
      let invocationCount = await mockSwap.invocationCountForMethod.call(
        swap_swapSimple
      )
      equal(
        invocationCount,
        1,
        "swap contact's swap.swapSimple was not called the expected number of times"
      )
    })

    it('test a successful transaction with decimal values', async () => {
      await peer.setRule(
        PEER_TOKEN,
        CONSUMER_TOKEN,
        MAX_PEER_AMOUNT,
        PRICE_COEF,
        EXP
      )

      let ruleBefore = await peer.rules.call(PEER_TOKEN, CONSUMER_TOKEN)

      let consumerAmount = 100
      let peerAmount = Math.floor((consumerAmount * 10 ** EXP) / PRICE_COEF)

      await passes(
        //mock swapContract
        //test rule decrement
        peer.provideOrder(
          1, //nonce
          2, //expiry
          EMPTY_ADDRESS, //consumerWallet
          consumerAmount, //consumerAmount
          CONSUMER_TOKEN, //consumerToken
          EMPTY_ADDRESS, //peerWallet
          peerAmount, //peerAmount
          PEER_TOKEN, //peerToken
          8, //v
          web3.utils.asciiToHex('r'), //r
          web3.utils.asciiToHex('s') //s
        )
      )

      let ruleAfter = await peer.rules.call(PEER_TOKEN, CONSUMER_TOKEN)
      equal(
        ruleAfter[0].toNumber(),
        ruleBefore[0].toNumber() - peerAmount,
        "rule's max peer amount was not decremented"
      )
    })
  })

  describe('Test provideUnsignedOrder', async () => {
    it('test provideUnsignedOrder call', async () => {
      await peer.setRule(PEER_TOKEN, CONSUMER_TOKEN, MAX_PEER_AMOUNT, 100, EXP)

      let consumerAmount = 100
      await passes(
        //mock swapContract
        //test rule decrement
        peer.provideUnsignedOrder(
          1, //nonce
          consumerAmount, //consumerAmount
          CONSUMER_TOKEN, //consumerToken
          100, //peerAmount
          PEER_TOKEN //peerToken
        )
      )

      //check if swap_swapSimple() was called
      let invocationCount = await mockSwap.invocationCountForMethod.call(
        swap_swapSimple
      )
      equal(
        invocationCount.toNumber(),
        1,
        "swap contact's swap.swapSimple was not called the expected number of times"
      )
    })
  })
})
