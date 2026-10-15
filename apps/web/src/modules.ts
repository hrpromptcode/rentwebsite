/**
 * Registers every business module with the storefront (section components, payment handlers).
 * Import this file once from the tenant layout so registration runs before rendering.
 */
import "@rentweb/module-commerce/register";
import "@rentweb/module-booking/register";
import "@rentweb/module-topup/register";
import "@rentweb/module-restaurant/register";
