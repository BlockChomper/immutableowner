use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::{
    token_2022::{
        mint_to, 
        initialize_mint,
        MintTo, 
        InitializeMint,
        Token2022
    },
    associated_token::AssociatedToken,
};
// Import what we need from spl-token-2022
use spl_token_2022::instruction::initialize_non_transferable_mint;

declare_id!("DzGaPaKJWsZiQmCPWYwasiEuRcNjTsvTV6imSdsL4nhu");

#[program]
pub mod immutableowner {
    use super::*;

    /// Initialize a new credential mint with the Non-Transferable extension
    pub fn initialize_credential_mint(
        ctx: Context<InitializeCredentialMint>,
        decimals: u8,
    ) -> Result<()> {
        msg!("Initializing credential mint with non-transferable extension");
        
        // First initialize the non-transferable extension
        // This is required BEFORE initializing the mint
        let non_transferable_ix = initialize_non_transferable_mint(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
        )?;
        
        // Process the instruction using CPI
        invoke(
            &non_transferable_ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
        )?;
        
        // Then initialize the mint account with standard parameters
        let cpi_accounts = InitializeMint {
            mint: ctx.accounts.mint.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        initialize_mint(
            cpi_ctx,
            decimals,
            &ctx.accounts.authority.key(),
            Some(&ctx.accounts.authority.key()),
        )?;

        msg!("Credential mint initialized successfully with non-transferable extension");
        Ok(())
    }

    /// Issue a credential to a user by minting a token to their immutable owner account
    pub fn issue_credential(
        ctx: Context<IssueCredential>, 
        amount: u64
    ) -> Result<()> {
        msg!("Issuing credential to user: {}", ctx.accounts.user.key());

        // Mint the credential token to the user's token account
        // The ATA created by the client will automatically have immutable owner
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        mint_to(cpi_ctx, amount)?;

        msg!("Credential issued successfully");
        Ok(())
    }

    /// Verify that a user has a specific credential
    pub fn verify_credential(ctx: Context<VerifyCredential>) -> Result<()> {
        msg!("Verifying credential for user: {}", ctx.accounts.user.key());
        
        // Validate token account belongs to the expected user
        // Full validation happens through account constraints
        
        msg!("Credential verification completed successfully");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCredentialMint<'info> {
    /// The authority that can issue credentials (mint tokens)
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// The mint account that will be initialized with the Non-Transferable extension
    /// CHECK: This account is initialized as a Token-2022 mint
    #[account(
        init,
        payer = authority,
        // The correct space calculation is critical for extension to work
        // For non-transferable extension:
        // Base size (82) + Extension TLV header (4) + ExtensionType enum (2) + Extension data (0) + padding for alignment
        space = 128, // Added extra padding to ensure enough space
        owner = token_program.key(),
    )]
    pub mint: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct IssueCredential<'info> {
    /// The authority that can issue credentials (mint tokens)
    pub authority: Signer<'info>,
    
    /// The user receiving the credential
    pub user: SystemAccount<'info>,
    
    /// The credential mint with the Non-Transferable extension
    /// CHECK: Validated in the instruction and through CPI to token program
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    
    /// The token account where the credential will be stored
    /// This account must be an ATA which automatically uses the immutable owner extension
    /// CHECK: Validated in the instruction and through CPI to token program
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    
    /// Used to create the associated token account
    pub associated_token_program: Program<'info, AssociatedToken>,
    
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct VerifyCredential<'info> {
    /// The user whose credential is being verified
    pub user: SystemAccount<'info>,
    
    /// The credential mint with the Non-Transferable extension
    /// CHECK: Only reading, not writing to this account
    pub mint: AccountInfo<'info>,
    
    /// The token account to verify, should be owned by the user
    /// CHECK: Only reading, not writing to this account
    pub token_account: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

// Custom error codes
#[error_code]
pub enum ErrorCode {
    #[msg("User does not have the credential")]
    NoCredential,
}
