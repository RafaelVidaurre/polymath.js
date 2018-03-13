import Web3Contract from 'web3-eth-contract'
import type { NetworkParams } from './types'

export default class Contract {
  static params: NetworkParams = null;
  _artifact: Object = null;
  _contract: Web3Contract = null;
  _methods: Object = null;
  address: string = null;

  constructor (_artifact) {
    this._artifact = _artifact
    return new Proxy(this, {
      get: (target: Contract, field: string) => {
        try {
          target._init()
        } catch (e) {
          // eslint-disable-next-line
          console.error('Contract init failed', e)
          return undefined
        }
        if (field in target) {
          return target[field]
        }
        const method = target._contract.methods[field]
        if (this._isView(field)) {
          return (...args) => method(...args).call()
        }
        return (...args) => this._tx(method(...args))
      },
    })
  }

  get account (): string {
    return Contract.params.account
  }

  /** @private */
  _newContract (isWebSockets: boolean = false) {
    return new (isWebSockets
      ? Contract.params.web3WS
      : Contract.params.web3
    ).eth.Contract(this._artifact.abi, this.address)
  }

  /** @private */
  _init () {
    try {
      const { address } = this._artifact.networks[Contract.params.id]
      if (this._contract && this.address === address) {
        return
      }
      this.address = address
    } catch (e) {
      throw new Error('Contract is not deployed to the network ' + Contract.params.id)
    }
    this._contract = this._newContract()
    this._methods = this._contract.methods
  }

  /**
   * Checks whether a contract function is constant (view) or not.
   * @param name
   * @returns {boolean}
   * @private
   */
  _isView (name: string): boolean {
    for (let i = 0; i < this._artifact.abi.length; i++) {
      const method = this._artifact.abi[i]
      if (method.name === name) {
        return method.stateMutability === 'view'
      }
    }
    throw new Error(`_isView: no method with "${name}" found`)
  }

  /**
   * Checks whether a contract function has boolean output or not.
   * @param name
   * @returns {boolean}
   * @private
   */
  _isBoolOutput (name: string): boolean {
    for (let i = 0; i < this._artifact.abi.length; i++) {
      const method = this._artifact.abi[i]
      if (method.name === name) {
        if (!method.outputs.length) {
          return false
        }
        return (
          method.outputs[0].name === '' && method.outputs[0].type === 'bool'
        )
      }
    }
    throw new Error(`_isBoolOutput: no method with "${name}" found`)
  }

  /**
   * @param method
   * @returns {Promise.<Object>}
   * @protected
   */
  async _tx (method): Object {
    const params = { from: this.account }
    params.gas = await method.estimateGas(params)

    // dry run
    try {
      const okCode = this._isBoolOutput(method._method.name)
      const dryResult = await method.call(params)
      if (okCode && dryResult !== okCode) {
        throw new Error(`Expected ${okCode}, but received ${dryResult}`)
      }
    } catch (e) {
      throw new Error(`Transaction dry run failed: ${e.message}`)
    }

    const receipt = await method.send(params, (error, hash) => {
      if (!error) {
        Contract.params.txHashCallback(hash)
      }
    })
    Contract.params.txEndCallback(receipt)

    if (receipt.status === '0x0') {
      throw new Error('Transaction failed')
    }

    return receipt
  }

  async subscribe (
    eventName: string,
    filter: Object,
    callback: (event: ?Object) => void,
  ): boolean {
    try {
      await this._newContract(true).events[eventName](
        { filter },
        (error, event) => {
          if (error) {
            // eslint-disable-next-line
            console.error(`Event "${eventName}" subscription error`, error)
            callback()
            return
          }
          // eslint-disable-next-line
          console.log(`Emitted ${eventName} event`, event)
          callback(event)
        },
      )
      return true
    } catch (e) {
      // eslint-disable-next-line
      console.error(`Event "${eventName}" subscription failed`, e)
      return false
    }
  }

  static unsubscribe (): boolean {
    return Contract.params.web3WS.eth.clearSubscriptions()
  }

  /**
   * @param v
   * @returns {string}
   * @protected
   */
  _toBytes (v: string): string {
    return Contract._web3.utils.asciiToHex(v).replace(/\u0000/g, '')
  }

  /**
   * @param v
   * @returns {boolean}
   * @protected
   */
  _isEmptyAddress (v: string): boolean {
    return v === '0x0000000000000000000000000000000000000000'
  }
}