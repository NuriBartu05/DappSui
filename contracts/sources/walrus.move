/// WALRUS token for the Gasless DEX MVP
/// Custom token that users can swap USDC for
module gasless_dex_tokens::walrus {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::url;

    /// The WALRUS coin type
    public struct WALRUS has drop {}

    /// One-time witness pattern for coin initialization
    fun init(witness: WALRUS, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<WALRUS>(
            witness,
            9, // 9 decimals like SUI
            b"WALRUS",
            b"Walrus Token",
            b"Walrus Token for Gasless DEX - Hackathon Demo",
            option::some(url::new_unsafe_from_bytes(b"https://avatars.githubusercontent.com/u/118abortedfetch")),
            ctx
        );
        
        // Transfer treasury cap to deployer for minting
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        // Freeze metadata - it won't change
        transfer::public_freeze_object(metadata);
    }

    /// Public mint function - anyone can mint test WALRUS
    /// In production, this would be restricted!
    /// @param treasury_cap - The treasury capability for minting
    /// @param amount - Amount to mint (in smallest units, 9 decimals)
    /// @param recipient - Address to receive the minted coins
    public entry fun mint(
        treasury_cap: &mut TreasuryCap<WALRUS>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// Burn WALRUS tokens
    public entry fun burn(
        treasury_cap: &mut TreasuryCap<WALRUS>,
        coin: Coin<WALRUS>
    ) {
        coin::burn(treasury_cap, coin);
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(WALRUS {}, ctx);
    }
}
