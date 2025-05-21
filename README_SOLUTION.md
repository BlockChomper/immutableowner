# Non-Transferable Token Extension with Solana Token-2022

This project demonstrates how to use the Non-Transferable extension in the Token-2022 program to create "soul-bound" tokens that cannot be transferred between users.

## Problem We Solved

We encountered challenges when attempting to initialize a non-transferable mint using Anchor's account initialization patterns. The main issue was that Token-2022 extensions require a specific initialization sequence that doesn't align well with Anchor's `#[account(init)]` pattern.

## Solution

We've implemented two approaches:

1. **Anchor Program (Partially Working)**: Located in `programs/immutableowner/src/lib.rs`
2. **Standalone TypeScript Client (Fully Working)**: Located in `standalone-client.ts`

## Key Learnings

### Critical Requirements for Non-Transferable Mint Initialization

The initialization of a non-transferable token mint requires:

1. **Proper Sequence**:
   ```
   1. SystemProgram.createAccount
   2. createInitializeNonTransferableMintInstruction
   3. createInitializeMintInstruction
   ```

2. **Correct Space Calculation**:
   ```typescript
   const extensions = [ExtensionType.NonTransferable];
   const mintLen = getMintLen(extensions);
   ```

3. **Sufficient Rent Allocation**:
   ```typescript
   const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
   ```

### How We Solved It

The solution was to create a standalone TypeScript client that follows Solana's documentation exactly. The TypeScript client:

1. Creates a new account with the right size using `SystemProgram.createAccount`
2. Initializes the non-transferable extension with `createInitializeNonTransferableMintInstruction`
3. Initializes the mint with `createInitializeMintInstruction`
4. Demonstrates minting tokens to a user's account
5. Demonstrates that tokens cannot be transferred (expected failure)

## Running the Standalone Client

To run the standalone client:

1. Start a local Solana test validator:
   ```bash
   solana-test-validator
   ```

2. In a new terminal, run the client:
   ```bash
   npx ts-node standalone-client.ts
   ```

## The Challenge with Anchor Integration

The primary challenge with Anchor is that its `#[account(init)]` attribute wraps the `SystemProgram.createAccount` instruction, but the non-transferable extension needs to be initialized immediately after account creation and before mint initialization.

Potential solutions if you want to stick with Anchor:

1. **Custom CPI Logic**: Skip using `#[account(init)]` and manually create the account with your own CPI call sequence
2. **Extension-First Design**: Design your Anchor program with token extensions as a primary consideration

## Recommendations for Solana Token-2022 Extensions

1. **Use Standalone Clients**: For complex extension patterns, it's often clearer to use standalone TypeScript clients
2. **Start Small**: Test each extension independently before combining multiple extensions
3. **Space Calculation**: Always use the proper space calculation functions like `getMintLen()`
4. **Precise Initialization Order**: Follow the exact initialization order from the Solana documentation
5. **Verify Failure Modes**: Test that tokens behave as expected (e.g., non-transferable tokens should fail during transfer)

## References

- [Solana Non-Transferable Token Guide](https://solana.com/developers/guides/token-extensions/non-transferable)
- [Token-2022 Documentation](https://spl.solana.com/token-2022)

## Troubleshooting

Common errors:

- `InvalidAccountData`: Usually indicates incorrect account initialization or size
- `Error: 0x25`: Error code indicating transfer is disabled for a non-transferable mint (expected during transfer attempts) 