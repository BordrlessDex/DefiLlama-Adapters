const { getConfig } = require('../helper/cache')
const { get } = require('../helper/http')
const { sumTokens2, getMultipleAccounts } = require('../helper/solana')

// $BORDR, the protocol's own token: its wrapped supply sits in the treasury wallet, so it is not counted.
const BORDR = '6Mix12LiHrQFojaQEnfPUC65Qkwd6X4Y5Qg93oFbordr'
const SOL = 'So11111111111111111111111111111111111111112'

// The list comes from the Bordrless API, the balances from the chain. An entry without `kind` is a bridge
// vault (SOL or an SPL token backing a bridged asset). An entry with `kind` is a native-SOL owner (a pool,
// launch, kit, companion or vault slot holding its SOL as lamports on the account itself), counted above
// `excludeLamports` (its rent-exempt minimum).
async function vaults() {
  return getConfig('bordrless/vaults', undefined, {
    fetcher: async () => {
      const list = await get('https://bordrless.app/api/stats/defillama/vaults')
      if (!Array.isArray(list) || !list.some((v) => v.native)) throw new Error('bordrless: bad vault list')
      return list
    },
  })
}

async function tvl(api) {
  const all = await vaults()
  const bridge = all.filter((v) => !v.kind && v.underlyingMint !== BORDR)
  const solOwners = bridge.filter((v) => v.native).map((v) => v.vault)
  const tokenAccounts = bridge.filter((v) => !v.native).map((v) => v.vault)
  const owners = all.filter((v) => v.kind)
  const infos = await getMultipleAccounts(owners.map((v) => v.vault), { api })
  infos.forEach((info, i) => {
    if (!info) return
    const above = BigInt(info.lamports) - BigInt(owners[i].excludeLamports ?? '0')
    if (above > 0n) api.add(SOL, above.toString())
  })
  return sumTokens2({ api, tokenAccounts, solOwners })
}

module.exports = {
  timetravel: false,
  methodology: 'TVL is the SOL held by Bordrless pools, launches, holder-reward kits and companions (native SOL, above each account\'s rent-exempt minimum) plus the SOL and SPL tokens in the Bordrless bridge vaults, which back every bridged asset. Coins launched on Bordrless and $BORDR are not counted.',
  solana: { tvl },
}
