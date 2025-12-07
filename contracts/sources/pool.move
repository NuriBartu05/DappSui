/// Gasless DEX Pool - Atomic Swap Contract
/// 
/// This contract holds WALRUS and SUI liquidity as shared objects,
/// enabling atomic swaps where tokens are only transferred when user signs.
/// 
/// Key Features:
/// - Shared pool object for atomic swaps
/// - Admin can deposit/withdraw liquidity
/// - Users can swap USDC for WALRUS 
/// - Users can swap USDC for SUI (Get Gas)
module gasless_dex_tokens::pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use gasless_dex_tokens::usdc::USDC;
    use gasless_dex_tokens::walrus::WALRUS;

    // ============================================
    // ERROR CODES
    // ============================================
    
    const EInsufficientPoolBalance: u64 = 0;
    const EInsufficientPayment: u64 = 1;
    const ENotAdmin: u64 = 2;
    const EZeroAmount: u64 = 3;

    // ============================================
    // CONSTANTS
    // ============================================
    
    /// Exchange rate: 1 USDC (6 decimals) = 10 WALRUS (9 decimals)
    /// 1_000_000 USDC units = 10_000_000_000 WALRUS units
    const USDC_TO_WALRUS_RATE: u64 = 10_000; // Multiplier to convert USDC to WALRUS
    
    /// Get Gas amount: 0.1 SUI = 100_000_000 MIST
    const GET_GAS_AMOUNT: u64 = 100_000_000;

    // ============================================
    // STRUCTS
    // ============================================

    /// The main liquidity pool - a shared object
    public struct Pool has key {
        id: UID,
        /// Admin address - can manage liquidity
        admin: address,
        /// WALRUS liquidity for swaps
        walrus_balance: Balance<WALRUS>,
        /// SUI liquidity for Get Gas feature
        sui_balance: Balance<SUI>,
        /// Accumulated USDC from swaps
        usdc_balance: Balance<USDC>,
    }

    /// Admin capability for privileged operations
    public struct AdminCap has key, store {
        id: UID,
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    /// Create the pool and admin capability
    /// Call this after deploying the package
    public entry fun create_pool(ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);
        
        // Create the shared pool
        let pool = Pool {
            id: object::new(ctx),
            admin,
            walrus_balance: balance::zero(),
            sui_balance: balance::zero(),
            usdc_balance: balance::zero(),
        };
        
        // Create admin capability
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        
        // Share the pool publicly
        transfer::share_object(pool);
        
        // Transfer admin cap to creator
        transfer::transfer(admin_cap, admin);
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /// Deposit WALRUS into the pool
    public entry fun deposit_walrus(
        pool: &mut Pool,
        _admin_cap: &AdminCap,
        walrus: Coin<WALRUS>,
        ctx: &TxContext
    ) {
        assert!(pool.admin == tx_context::sender(ctx), ENotAdmin);
        let walrus_balance = coin::into_balance(walrus);
        balance::join(&mut pool.walrus_balance, walrus_balance);
    }

    /// Deposit SUI into the pool
    public entry fun deposit_sui(
        pool: &mut Pool,
        _admin_cap: &AdminCap,
        sui: Coin<SUI>,
        ctx: &TxContext
    ) {
        assert!(pool.admin == tx_context::sender(ctx), ENotAdmin);
        let sui_balance = coin::into_balance(sui);
        balance::join(&mut pool.sui_balance, sui_balance);
    }

    /// Deposit USDC into the pool (for reverse swap liquidity)
    public entry fun deposit_usdc(
        pool: &mut Pool,
        usdc: Coin<USDC>,
        _ctx: &mut TxContext
    ) {
        coin::put(&mut pool.usdc_balance, usdc);
    }

    /// Withdraw USDC from the pool (collect revenue)
    public entry fun withdraw_usdc(
        pool: &mut Pool,
        _admin_cap: &AdminCap,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(pool.admin == tx_context::sender(ctx), ENotAdmin);
        let usdc_coin = coin::take(&mut pool.usdc_balance, amount, ctx);
        transfer::public_transfer(usdc_coin, tx_context::sender(ctx));
    }

    /// Withdraw WALRUS from the pool
    public entry fun withdraw_walrus(
        pool: &mut Pool,
        _admin_cap: &AdminCap,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(pool.admin == tx_context::sender(ctx), ENotAdmin);
        let walrus_coin = coin::take(&mut pool.walrus_balance, amount, ctx);
        transfer::public_transfer(walrus_coin, tx_context::sender(ctx));
    }

    /// Withdraw SUI from the pool
    public entry fun withdraw_sui(
        pool: &mut Pool,
        _admin_cap: &AdminCap,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(pool.admin == tx_context::sender(ctx), ENotAdmin);
        let sui_coin = coin::take(&mut pool.sui_balance, amount, ctx);
        transfer::public_transfer(sui_coin, tx_context::sender(ctx));
    }

    // ============================================
    // USER FUNCTIONS - ATOMIC SWAPS
    // ============================================

    /// Swap USDC for WALRUS
    /// Rate: 1 USDC = 10 WALRUS
    /// 
    /// @param pool - The shared liquidity pool
    /// @param usdc_payment - User's USDC payment
    /// @param ctx - Transaction context
    public entry fun swap_usdc_for_walrus(
        pool: &mut Pool,
        usdc_payment: Coin<USDC>,
        ctx: &mut TxContext
    ) {
        let usdc_amount = coin::value(&usdc_payment);
        assert!(usdc_amount > 0, EZeroAmount);
        
        // Calculate WALRUS amount: USDC has 6 decimals, WALRUS has 9
        // 1 USDC (1_000_000 units) = 10 WALRUS (10_000_000_000 units)
        let walrus_amount = usdc_amount * USDC_TO_WALRUS_RATE;
        
        // Check pool has enough WALRUS
        assert!(balance::value(&pool.walrus_balance) >= walrus_amount, EInsufficientPoolBalance);
        
        // Take payment
        let usdc_balance = coin::into_balance(usdc_payment);
        balance::join(&mut pool.usdc_balance, usdc_balance);
        
        // Send WALRUS to user
        let walrus_coin = coin::take(&mut pool.walrus_balance, walrus_amount, ctx);
        transfer::public_transfer(walrus_coin, tx_context::sender(ctx));
    }

    /// Get Gas: Swap USDC for SUI (0.1 SUI)
    /// 
    /// @param pool - The shared liquidity pool
    /// @param usdc_payment - User's USDC payment (must cover SUI cost)
    /// @param sui_price_in_usdc_micro - Current SUI price in micro USDC (e.g., 1.5 USDC = 1_500_000)
    /// @param ctx - Transaction context
    public entry fun get_gas(
        pool: &mut Pool,
        usdc_payment: Coin<USDC>,
        sui_price_in_usdc_micro: u64,
        ctx: &mut TxContext
    ) {
        let usdc_paid = coin::value(&usdc_payment);
        
        // Calculate required USDC for 0.1 SUI
        // GET_GAS_AMOUNT = 100_000_000 (0.1 SUI in MIST)
        // sui_price_in_usdc_micro = price of 1 SUI in micro USDC (6 decimals)
        // Required = (0.1 * price) = (GET_GAS_AMOUNT * price) / 10^9
        let required_usdc = (GET_GAS_AMOUNT * sui_price_in_usdc_micro) / 1_000_000_000;
        
        assert!(usdc_paid >= required_usdc, EInsufficientPayment);
        
        // Check pool has enough SUI
        assert!(balance::value(&pool.sui_balance) >= GET_GAS_AMOUNT, EInsufficientPoolBalance);
        
        // Take payment
        let usdc_balance = coin::into_balance(usdc_payment);
        balance::join(&mut pool.usdc_balance, usdc_balance);
        
        // Send SUI to user
        let sui_coin = coin::take(&mut pool.sui_balance, GET_GAS_AMOUNT, ctx);
        transfer::public_transfer(sui_coin, tx_context::sender(ctx));
    }

    /// Swap WALRUS for USDC (Reverse Swap)
    /// Rate: 10 WALRUS = 1 USDC
    /// 
    /// @param pool - The shared liquidity pool
    /// @param walrus_payment - User's WALRUS payment
    /// @param ctx - Transaction context
    public entry fun swap_walrus_for_usdc(
        pool: &mut Pool,
        walrus_payment: Coin<WALRUS>,
        ctx: &mut TxContext
    ) {
        let walrus_amount = coin::value(&walrus_payment);
        assert!(walrus_amount > 0, EZeroAmount);
        
        // Calculate USDC amount: WALRUS has 9 decimals, USDC has 6
        // 10 WALRUS (10_000_000_000 units) = 1 USDC (1_000_000 units)
        // USDC = WALRUS / USDC_TO_WALRUS_RATE
        let usdc_amount = walrus_amount / USDC_TO_WALRUS_RATE;
        
        // Ensure we're returning at least some USDC
        assert!(usdc_amount > 0, EZeroAmount);
        
        // Check pool has enough USDC
        assert!(balance::value(&pool.usdc_balance) >= usdc_amount, EInsufficientPoolBalance);
        
        // Take WALRUS payment and add to pool
        let walrus_balance = coin::into_balance(walrus_payment);
        balance::join(&mut pool.walrus_balance, walrus_balance);
        
        // Send USDC to user
        let usdc_coin = coin::take(&mut pool.usdc_balance, usdc_amount, ctx);
        transfer::public_transfer(usdc_coin, tx_context::sender(ctx));
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /// Get pool balances
    public fun get_balances(pool: &Pool): (u64, u64, u64) {
        (
            balance::value(&pool.walrus_balance),
            balance::value(&pool.sui_balance),
            balance::value(&pool.usdc_balance)
        )
    }

    /// Get WALRUS balance
    public fun walrus_balance(pool: &Pool): u64 {
        balance::value(&pool.walrus_balance)
    }

    /// Get SUI balance
    public fun sui_balance(pool: &Pool): u64 {
        balance::value(&pool.sui_balance)
    }

    /// Get USDC balance
    public fun usdc_balance(pool: &Pool): u64 {
        balance::value(&pool.usdc_balance)
    }

    /// Get admin address
    public fun admin(pool: &Pool): address {
        pool.admin
    }
}
