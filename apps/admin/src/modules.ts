/**
 * Registers business modules (payment handlers + storefront sections) for the admin app so that
 * admin actions like markPaid() trigger the same module logic as the storefront.
 */
import "@rentweb/module-commerce/register";
import "@rentweb/module-booking/register";
import "@rentweb/module-topup/register";
import "@rentweb/module-restaurant/register";
