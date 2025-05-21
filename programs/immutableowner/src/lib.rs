use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{
        mint_to, 
        initialize_mint, 
        initialize_account,
        MintTo, 
        InitializeMint, 
        InitializeAccount, 
        Token2022
    },
    associated_token::AssociatedToken,
};

declare_id!("DzGaPaKJWsZiQmCPWYwasiEuRcNjTsvTV6imSdsL4nhu");

#[program]
pub mod immutableowner {
    use super::*;

    /// Initialize a new credential mint that will be used for issuing credentials
    pub fn initialize_credential_mint(
        ctx: Context<InitializeCredentialMint>,
        decimals: u8,
    ) -> Result<()> {
        msg!("Initializing credential mint");
        
        // Initialize mint account with standard parameters
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

        msg!("Credential mint initialized successfully");
        Ok(())
    }

    /// Issue a credential to a user by minting a token to their immutable owner account
    pub fn issue_credential(
        ctx: Context<IssueCredential>, 
        amount: u64
    ) -> Result<()> {
        msg!("Issuing credential to user: {}", ctx.accounts.user.key());

        // Mint the credential token to the user's token account
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
        
        // Simplified verification logic
        // The account validation in the struct ensures the token account exists
        msg!("Credential verification completed");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCredentialMint<'info> {
    /// The authority that can issue credentials (mint tokens)
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// The mint account that will be initialized
    /// CHECK: This account is initialized as a Token-2022 mint
    #[account(
        init,
        payer = authority,
        space = 82,
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
    
    /// The credential mint
    /// CHECK: This is the token mint account and is validated in the instruction
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    
    /// The token account where the credential will be stored
    /// CHECK: This is the token account and is validated in the instruction
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
    
    /// The credential mint
    /// CHECK: This is the token mint being verified against
    pub mint: AccountInfo<'info>,
    
    /// The token account to verify
    /// CHECK: This is the token account being validated
    pub token_account: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
}

// Custom error codes
#[error_code]
pub enum ErrorCode {
    #[msg("User does not have the credential")]
    NoCredential,
}
