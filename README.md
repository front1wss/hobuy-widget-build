[← Go Back](../README.md)

## Integration Documentation

### [Example](https://front1wss.github.io/hobuy-widget-build/)

### Widget Props

| Prop           | Type     | Required | Description                                                                 |
|----------------|----------|----------|-----------------------------------------------------------------------------|
| locale         | en \| uk | No       | Locale of widget translates. Default is 'en'                                | Yes                                                                         | Widget language/locale (e.g., 'en', 'uk').                                  |
| product        | object   | Yes      | Product object. See below for required fields.                              |
| shopCurrency   | string   | Yes      | Currency code (e.g., 'UAH', 'USD').                                         |
| customerName   | string   | No       | Customer's name.                                                            |
| onStartAuction | function | Yes      | Callback triggered to start auction. Receives cart and customerName.        |
| onUseWinData   | function | Yes      | Callback triggered with win data and an object with handleClearAuctionCart. |

#### Product Object Fields

| Field    | Type          | Required | Description                                                   |
|----------|---------------|----------|---------------------------------------------------------------|
| id       | string/number | Yes      | Product ID.                                                   |
| imageUrl | string        | Yes      | Product image URL.                                            |
| name     | string        | Yes      | Product name.                                                 |
| price    | number        | Yes      | Product price (calculate in pennies before passing as props). |

### Usage Example (React)

Firstly, add the package manually in your project to package.json:

```json
{
  "dependencies": {
    "hobuy-widget": "git+https://github.com/front1wss/hobuy-widget-build#main"
  }
}
```

Then, install the package using your package manager:

```bash
  npm install
```

or

```bash
  pnpm install
```

or

```bash
  yarn install
```

Then, you can use the widget in your React component:

```jsx
import 'hobuy-widget/dist/styles.css';
import HobuyWidget from 'hobuy-widget';

const YourComponent = () => {
  return (
    <HobuyWidget
      locale={'en' || 'uk'}
      product={{
        id: 10226342363466,
        imageUrl: 'https://via.placeholder.com/600/771796',
        name: 'Gift Card',
        price: 10,
      }}
      shopCurrency={'UAH'}
      customerName={'John Doe'}
      onStartAuction={handleStartAuction} // Example bellow
      onUseWinData={handleUseWinData} // Example bellow
    />
  );
};

export default YourComponent;
```

### Usage Example (CDN)

```js
window.addEventListener('load', () => {
  window.HobuyWidget.init({
    locale: 'en',
    product: {
      id: 10226342363466,
      imageUrl: 'https://via.placeholder.com/600/771796',
      name: 'Gift Card',
      price: 10,
    },
    shopCurrency: 'UAH',
    customerName: 'John Doe',
    onStartAuction: handleStartAuction,  // Example bellow
    onUseWinData: handleUseWinData,  // Example bellow
  });
});
```

### Callbacks

#### onStartAuction

- **Type:** `(product: Product, customerName?: string) => Promise<{ socketUrl: string }>`
- **Description:**
  Triggered when the user initiates an auction. This async function should handle any required logic (e.g., authentication, product validation, or backend communication) and return an object containing the `socketUrl` for the auction websocket
  connection.
- **Arguments:**
    - `product`: The product object for which the auction is being started.
    - `customerName` (optional): The name of the customer starting the auction.
- **Returns:**
    - `{ socketUrl: string }`: The websocket URL for auction communication.
- **Example:**

```js
const handleStartAuction = async (product, customerName) => {
  // Some async operations...
  return {
    socketUrl: 'ws://...',
  };
};
```

### onUseWinData

- **Type:** `(data: WinData, { handleClearAuctionCart }: { handleClearAuctionCart: () => void }) => void`
- **Description:** Triggered when the user wins an auction. This function handle the win data and perform any necessary actions, such as clearing the auction cart.
-
    - **Arguments:**
- `data`: The data object containing information about the auction win.
- `handlers:` - An object containing the `handleClearAuctionCart` function to clear the auction cart.

```js
const handleUseWinData = async (data, handlers) => {
  const { handleClearAuctionCart } = handlers;
  // Some async operations...
  if (success) {
    handleClearAuctionCart();
    // Logic...
  } else {
    // Another logic...
  }
};
```
