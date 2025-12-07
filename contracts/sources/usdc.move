/// Test USDC token for the Gasless DEX MVP
/// This is a simple coin with a public mint function for testing purposes
module gasless_dex_tokens::usdc {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::url;

    /// The USDC coin type
    public struct USDC has drop {}

    /// One-time witness pattern for coin initialization
    fun init(witness: USDC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency<USDC>(
            witness,
            6, // 6 decimals like real USDC
            b"USDC",
            b"USD Coin (Test)",
            b"Test USDC for Gasless DEX - Hackathon Demo",
            option::some(url::new_unsafe_from_bytes(b"https://cryptologos.cc/logos/usd-coin-usdc-logo.png")),
            ctx
        );
        
        // Transfer treasury cap to deployer for minting
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        // Freeze metadata - it won't change
        transfer::public_freeze_object(metadata);
    }

    /// Public mint function - anyone can mint test USDC
    /// In production, this would be restricted!
    /// @param treasury_cap - The treasury capability for minting
    /// @param amount - Amount to mint (in smallest units, 6 decimals)
    /// @param recipient - Address to receive the minted coins
    public entry fun mint(
        treasury_cap: &mut TreasuryCap<USDC>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// Burn USDC tokens
    public entry fun burn(
        treasury_cap: &mut TreasuryCap<USDC>,
        coin: Coin<USDC>
    ) {
        coin::burn(treasury_cap, coin);
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(USDC {}, ctx);
    }
}
