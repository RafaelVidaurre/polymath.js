// @flow

import artifact from 'polymath-core/build/contracts/TickerRegistry.json'

import Contract from './Contract'
import IPFS from '../IPFS'

import type { SymbolDetails, Web3Event, Web3Receipt } from '../../types'

const LOG_REGISTER_TICKER = 'LogRegisterTicker'

type TickerIPFS = {
}

class TickerRegistry extends Contract {

  expiryLimit: () => Promise<number>

  async _getRegisterTickerEvents (): Promise<Array<Web3Event>> {
    return await this._contractWS.getPastEvents(LOG_REGISTER_TICKER, {
      filter: { _owner: this.account },
      fromBlock: 0,
      toBlock: 'latest'
    })
  }

  async getDetails (symbol: string): Promise<?SymbolDetails> {
    let [owner, timestamp, name, ipfsHash, status] = this._toArray(await this._methods.getDetails(symbol).call())
    if (this._isEmptyAddress(owner)) {
      return null
    }

    // TODO @bshevchenko: _timestamp in LogRegisterTicker event of polymath-core@1.0.1 is not indexed, hence we can't...
    // TODO @bshevchenko: ...filter by it. Fix this when it'll be indexed
    let txHash
    const events = await this._getRegisterTickerEvents()
    for (let event of events) {
      if (event.returnValues._timestamp === timestamp) {
        txHash = event.transactionHash
      }
    }

    timestamp = this._toDate(timestamp)
    let expires
    if (!status) {
      const expiryLimit = await this.expiryLimit() * 1000
      expires = new Date(timestamp.getTime() + expiryLimit)
    }
    return {
      ticker: symbol,
      owner,
      timestamp,
      name,
      status,
      expires,
      txHash,
      ...await IPFS.get(ipfsHash)
    }
  }

  async getMyTokens (): Promise<Array<SymbolDetails>> {
    const events = await this._getRegisterTickerEvents()
    const tokens = []
    for (let event of events) {
      const details = await this.getDetails(event.returnValues._symbol)
      if (details) {
        tokens.push(details)
      }
    }
    return tokens
  }

  async registerTicker (details: SymbolDetails): Promise<Web3Receipt> {
    const ipfs: TickerIPFS = { }
    const hash = await IPFS.put(ipfs)
    return await this._tx(
      this._methods.registerTicker(this.account, details.ticker, details.name, hash)
    )
  }
}

export default new TickerRegistry(artifact)