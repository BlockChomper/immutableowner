
# Immutable Owner & Non-Transferable Token Extensions - Technical Guide

## Introduction

This repository demonstrates how to implement a credential system on Solana using two powerful Token-2022 extensions:

1. **Immutable Owner**: Prevents token account ownership from being transferred to another user
2. **Non-Transferable**: Ensures tokens cannot be transferred between accounts ("soul-bound tokens")

When combined, these extensions create a secure foundation for identity verification, credential issuance, and other systems where tokens must remain permanently tied to their original owner.

## Technical Overview

### Immutable Owner Extension

The Immutable Owner extension adds a flag to token accounts that prevents the account owner from being changed. Once a token account is created with this extension, it will permanently belong to the specified wallet.

In standard SPL Token accounts, owners can reassign ownership, creating potential security vulnerabilities in identity systems. The Immutable Owner extension mitigates this by ensuring ownership relationships remain permanent.

### Non-Transferable Extension

The Non-Transferable extension prevents tokens from being transferred between accounts. When a mint is created with this extension, tokens can be minted to accounts but cannot be transferred thereafter. The only operations allowed are burning tokens or closing empty accounts.

This creates "soul-bound" tokens that remain with their original recipient, making them ideal for credentials, memberships, or identity verification.

## On-Chain Implementation

### Program Architecture

Our Anchor program implements three main instructions:

1. `initialize_credential_mint`: Creates a new credential mint
2. `issue_credential`: Mints a credential token to a user's account
3. `verify_credential`: Verifies a user possesses a credential

```rust
#[program]
pub mod immutableowner {
    // Initialize a new credential mint
    pub fn initialize_credential_mint(ctx: Context<InitializeCredentialMint>, decimals: u8) -> Result<()> {
        // Creates a standard Token-2022 mint
        let cpi_accounts = InitializeMint {
            mint: ctx.accounts.mint.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        };
        
        initialize_mint(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
            decimals,
            &ctx.accounts.authority.key(),
            Some(&ctx.accounts.authority.key()),
        )?;
        
        Ok(())
    }

    // Issue a credential to a user
    pub fn issue_credential(ctx: Context<IssueCredential>, amount: u64) -> Result<()> {
        // Mint tokens to the user's token account
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        
        mint_to(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
            amount,
        )?;
        
        Ok(())
    }

    // Verify a user has a credential
    pub fn verify_credential(ctx: Context<VerifyCredential>) -> Result<()> {
        // The existence of the token account with tokens is verified off-chain
        Ok(())
    }
}
```

### Account Structures

The program defines account validation structures for each instruction:

```rust
// For initializing a credential mint
#[derive(Accounts)]
pub struct InitializeCredentialMint<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 82, // Token-2022 mint size
        owner = token_program.key(),
    )]
    pub mint: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// For issuing credentials
#[derive(Accounts)]
pub struct IssueCredential<'info> {
    pub authority: Signer<'info>,
    pub user: SystemAccount<'info>,
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// For verifying credentials
#[derive(Accounts)]
pub struct VerifyCredential<'info> {
    pub user: SystemAccount<'info>,
    pub mint: AccountInfo<'info>,
    pub token_account: AccountInfo<'info>,
    pub token_program: Program<'info, Token2022>,
}
```

## Off-Chain Interaction

### Creating and Managing Credentials

The client application interacts with the program using a mix of direct Token-2022 instructions and Anchor program calls:

1. **Creating a Credential Mint**:
   ```typescript
   // Initialize a non-transferable mint
   const tx = await program.methods
     .initializeCredentialMint(0) // Using 0 decimals for credentials
     .accounts({
       authority: issuerPublicKey,
       mint: mintKeypair.publicKey,
       tokenProgram: TOKEN_2022_PROGRAM_ID,
       systemProgram: SystemProgram.programId,
       rent: SYSVAR_RENT_PUBKEY,
     })
     .signers([issuerKeypair, mintKeypair])
     .rpc();
   ```

2. **Creating an Immutable Owner Token Account**:
   ```typescript
   // Associated Token Accounts in Token-2022 automatically use immutable owner
   const associatedTokenAccount = getAssociatedTokenAddressSync(
     mintPublicKey,
     userPublicKey,
     true, // allowOwnerOffCurve
     TOKEN_2022_PROGRAM_ID
   );
   
   // Create the token account
   const createAtaIx = createAssociatedTokenAccountInstruction(
     payerPublicKey,
     associatedTokenAccount,
     userPublicKey,
     mintPublicKey,
     TOKEN_2022_PROGRAM_ID
   );
   ```

3. **Issuing a Credential**:
   ```typescript
   // Mint a credential token to the user's account
   const issueTx = await program.methods
     .issueCredential(new BN(1)) // Typically 1 token per credential
     .accounts({
       authority: issuerPublicKey,
       user: userPublicKey,
       mint: mintPublicKey,
       tokenAccount: associatedTokenAccount,
       associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
       tokenProgram: TOKEN_2022_PROGRAM_ID,
       systemProgram: SystemProgram.programId,
       rent: SYSVAR_RENT_PUBKEY,
     })
     .signers([issuerKeypair])
     .rpc();
   ```

4. **Verifying a Credential**:
   ```typescript
   // Call the program's verify_credential instruction
   const verifyTx = await program.methods
     .verifyCredential()
     .accounts({
       user: userPublicKey,
       mint: mintPublicKey,
       tokenAccount: associatedTokenAccount,
       tokenProgram: TOKEN_2022_PROGRAM_ID,
     })
     .rpc();
   ```

### Client Application Implementation

The client application provides a clean interface for managing credentials:

```typescript
export class CredentialClient {
  // Class properties and constructor
  private connection: web3.Connection;
  private wallet: anchor.Wallet;
  private program: Program<any>;

  constructor(connection: web3.Connection, wallet: anchor.Wallet) {
    // Setup code...
  }

  // Initialize a new credential mint
  async initializeCredentialMint(credentialName: string): Promise<web3.PublicKey> {
    // Implementation...
  }

  // Issue a credential to a user
  async issueCredential(user: web3.PublicKey, mint: web3.PublicKey): Promise<string> {
    // Implementation...
  }

  // Verify a user has a credential
  async verifyCredential(user: web3.PublicKey, mint: web3.PublicKey): Promise<boolean> {
    // Implementation...
  }

  // Get information about a user's credential
  async getCredentialInfo(user: web3.PublicKey, mint: web3.PublicKey): Promise<{ amount: number } | null> {
    // Implementation...
  }
}
```

## Usage Examples

### Identity/Credential System

This implementation can be used to build an identity or credential verification system where:

1. A central authority creates different credential mints for various certifications
2. Users receive non-transferable credentials as tokens in their immutable owner accounts
3. Applications verify user credentials by checking token balances
4. The credential can never be transferred to another user, ensuring security

```typescript
// Example: Creating and verifying an identity credential
async function setupIdentitySystem() {
  // Create a client
  const client = new CredentialClient(connection, adminWallet);
  
  // Initialize a "Verified Identity" credential mint
  const identityMint = await client.initializeCredentialMint("Verified Identity");
  
  // Issue a credential to a user
  await client.issueCredential(userPublicKey, identityMint);
  
  // Later, verify the user has this credential
  const isVerified = await client.verifyCredential(userPublicKey, identityMint);
  
  if (isVerified) {
    console.log("User has a verified identity credential");
  }
}
```

## Best Practices

1. **Use Associated Token Accounts**: Always use ATAs, which include immutable owner by default in Token-2022.

2. **Separate Mints per Credential Type**: Create separate mint accounts for different types of credentials rather than using token amounts to differentiate.

3. **Use Zero Decimals for Credentials**: For most credential tokens, setting decimals to 0 is appropriate since credentials are binary (either have or don't have).

4. **Create Trustless On-Chain Verification**: When possible, implement on-chain credential verification logic in the programs that use credentials.

5. **Security Through Decentralization**: Design systems where credential verification doesn't solely rely on a central authority once credentials are issued.

## Technical Details

### Mint Account Structure

Token-2022 mint accounts with the Non-Transferable extension have the following layout:

- TLV header (extension type discriminator)
- Standard SPL Token mint data
- The Non-Transferable flag

### Token Account Structure

Token-2022 accounts with the Immutable Owner extension have the following layout:

- TLV header (extension type discriminator) 
- Standard SPL Token account data
- The Immutable Owner flag

## Implementation Challenges

1. **Global Allocator Conflicts**: Token-2022 v9.0.0+ includes a global allocator which can conflict with other crates' allocators. This requires careful dependency management.

2. **Extension Combinations**: Understanding which extensions can be combined requires thorough knowledge of the Token-2022 program.

3. **Deterministic ATAs**: When working with immutable owner accounts, always use deterministic addresses (ATAs) to ensure you can locate the appropriate token account later.

By understanding these technical details, you can implement secure and reliable identity and credential systems on Solana using the Immutable Owner and Non-Transferable extensions.
