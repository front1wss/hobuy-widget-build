import { useState, useReducer, useEffect, createContext, createElement, useContext, useMemo, useRef, useCallback } from 'react';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { createPortal } from 'react-dom';

const parseJsonString = string => {
  try {
    return JSON.parse(string);
  } catch (e) {
    console.error('[parseJsonString] error: ', e);
    return null;
  }
};
const stringifyObject = object => {
  try {
    return JSON.stringify(object);
  } catch (e) {
    console.error('[stringifyObject] error: ', e);
    return null;
  }
};

const WS_EVENT_ENUM = {
  CONNECTION_SERVICE: 'connection-service',
  CONNECTION_AUCTION: 'connection-auction',
  CHANGE_MEMBERS: 'change-members',
  START: 'start',
  STEP: 'step',
  YOU_WIN: 'you-win',
  NOT_WIN: 'not-win',
  OTHER_WIN: 'other-win',
  SELF_WIN_BET: 'selfWinBet',
  STORE_WIN_DATA: 'store-win-data',
  BET: 'bet'
};

const STAGE_ENUM = {
  SELECTION: 'selection',
  WAIT_FIRST_ROUND: 'waitFirstRound',
  FIRST_ROUND: 'firstRound',
  WAIT_SECOND_ROUND: 'waitSecondRound',
  SECOND_ROUND: 'secondRound'
};
const STAGE_SCREENS_ENUM = {
  ...STAGE_ENUM,
  CART: 'cart',
  RESULTS: 'results'
};

class Storage {
  static _prefix = 'hobuy';
  static _usedKeys = this.getManagedKeys();
  static hasLocalStorage() {
    if (typeof localStorage === 'undefined') {
      console.warn('[Storage] localStorage is not available');
      return false;
    }
    return true;
  }
  static getManagedKeys() {
    const keys = new Set();
    if (!this.hasLocalStorage()) {
      return keys;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${this._prefix}_`)) {
        keys.add(key);
      }
    }
    return keys;
  }
  static getFullKey(key) {
    const resKey = `${this._prefix}_${key}`;
    this._usedKeys.add(resKey);
    return resKey;
  }
  static get(key) {
    if (!this.hasLocalStorage()) {
      return null;
    }
    const data = localStorage.getItem(this.getFullKey(key));
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('[GET Storage] data parsing error: ', e);
      return null;
    }
  }
  static set(key, value) {
    if (!this.hasLocalStorage()) {
      return;
    }
    try {
      localStorage.setItem(this.getFullKey(key), JSON.stringify(value));
    } catch (error) {
      console.warn('[SET Storage] Failed to save to localStorage:', error);
    }
  }
  static remove(key) {
    if (!this.hasLocalStorage()) {
      return;
    }
    try {
      localStorage.removeItem(this.getFullKey(key));
    } catch (error) {
      console.warn('[REMOVE Storage] Failed to remove from localStorage:', error);
    }
  }
  static clear() {
    if (!this.hasLocalStorage()) {
      return;
    }
    try {
      Array.from(this._usedKeys).forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn('[CLEAR Storage] Failed to clear localStorage:', error);
        }
      });
      this._usedKeys.clear();
    } catch (error) {
      console.warn('[CLEAR Storage] Failed to clear localStorage:', error);
    }
  }
}

const initialAuctionState = {
  isAuctionRunning: false,
  isSecondRoundWinner: false,
  isFirstRoundWinner: false,
  winnerPrice: 0,
  currentStage: null,
  currentCustomer: null,
  selectionMessage: null,
  waitRoundMessage: null,
  roundStepMessage: null,
  selfBetMessage: null,
  error: null,
  errorEvent: null,
  errorCode: null,
  winData: null
};
const getCurrentCustomer = (state, message) => {
  const currentCustomerId = state.selectionMessage?.data.sessionId;
  return message?.data.members.find(m => m.sessionId === currentCustomerId) || state.currentCustomer;
};
const reducer = (state, action) => {
  if (state.isFirstRoundWinner && action.type !== 'SET_WIN_DATA') {
    return state;
  }
  switch (action.type) {
    case 'SET_CURRENT_STAGE':
      return {
        ...state,
        currentStage: action.payload
      };
    case 'SET_SELECTION_MESSAGE':
      return {
        ...state,
        selectionMessage: action.payload,
        isAuctionRunning: true
      };
    case 'SET_WAIT_ROUND_MESSAGE':
      return {
        ...state,
        waitRoundMessage: action.payload,
        currentCustomer: getCurrentCustomer(state, action.payload)
      };
    case 'SET_ROUND_MESSAGE':
      return {
        ...state,
        roundStepMessage: action.payload
      };
    case 'SET_IS_FIRST_ROUND_WINNER':
      return {
        ...state,
        isFirstRoundWinner: action.payload.isWinner,
        winnerPrice: action.payload.price
      };
    case 'SET_IS_SECOND_ROUND_WINNER':
      return {
        ...state,
        isSecondRoundWinner: action.payload.isWinner,
        winnerPrice: action.payload.price
      };
    case 'SET_SELF_BET':
      return {
        ...state,
        selfBetMessage: action.payload
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload.error || null,
        errorCode: action.payload.errorCode || null,
        errorEvent: action.payload.event || null
      };
    case 'SET_WIN_DATA':
      return {
        ...state,
        winData: action.payload,
        currentStage: STAGE_SCREENS_ENUM.RESULTS
      };
    case 'RESET_ERROR':
      return {
        ...state,
        error: null,
        errorCode: null,
        errorEvent: null
      };
    case 'RESET':
      return initialAuctionState;
    default:
      return state;
  }
};
const useAuction = ({
  url
}) => {
  const [auctionSocket, setAuctionSocket] = useState(null);
  const [auctionState, setAuctionState] = useReducer(reducer, initialAuctionState);
  useEffect(() => {
    if (!url) {
      return;
    }
    const socket = new WebSocket(url.trim());
    setAuctionSocket(socket);
    socket.onmessage = eventMsg => {
      const msg = parseJsonString(eventMsg.data);
      if (!msg) return;
      if (Object.values(STAGE_SCREENS_ENUM).includes(msg.stage)) {
        setAuctionState({
          type: 'SET_CURRENT_STAGE',
          payload: msg.stage
        });
        Storage.set('current_stage', msg.stage);
      }
      if (msg.error || msg.errorCode) {
        setAuctionState({
          type: 'SET_ERROR',
          payload: msg
        });
        Storage.set('error', msg.stage);
      }
      if (msg.event == WS_EVENT_ENUM.CONNECTION_SERVICE && msg.stage == STAGE_ENUM.SELECTION) {
        setAuctionState({
          type: 'SET_SELECTION_MESSAGE',
          payload: msg
        });
        Storage.set('selection_message', msg);
      }
      if (msg.event == WS_EVENT_ENUM.CONNECTION_AUCTION && msg.stage == STAGE_ENUM.WAIT_FIRST_ROUND || msg.event == WS_EVENT_ENUM.CONNECTION_AUCTION && msg.stage == STAGE_ENUM.WAIT_SECOND_ROUND || msg.event == WS_EVENT_ENUM.CHANGE_MEMBERS) {
        setAuctionState({
          type: 'SET_WAIT_ROUND_MESSAGE',
          payload: msg
        });
        Storage.set('wait_round_message', msg);
      }
      if (msg.event == WS_EVENT_ENUM.START || msg.event == WS_EVENT_ENUM.STEP) {
        setAuctionState({
          type: 'SET_ROUND_MESSAGE',
          payload: msg
        });
        Storage.set('round_message', msg);
      }
      if (msg.event == WS_EVENT_ENUM.SELF_WIN_BET && msg.stage == STAGE_ENUM.SECOND_ROUND) {
        setAuctionState({
          type: 'SET_SELF_BET',
          payload: msg
        });
        Storage.set('self_bet', msg);
      }
      if (msg.event == WS_EVENT_ENUM.YOU_WIN && msg.stage == STAGE_ENUM.FIRST_ROUND) {
        setAuctionState({
          type: 'SET_IS_FIRST_ROUND_WINNER',
          payload: {
            isWinner: true,
            price: msg.data?.price || 0
          }
        });
        Storage.set('first_round_winner', {
          isWinner: true,
          price: msg.data?.price || 0
        });
      }
      if (msg.event == WS_EVENT_ENUM.YOU_WIN && msg.stage == STAGE_ENUM.SECOND_ROUND) {
        setAuctionState({
          type: 'SET_IS_SECOND_ROUND_WINNER',
          payload: {
            isWinner: true,
            price: msg.data?.price || 0
          }
        });
        Storage.set('second_round_winner', {
          isWinner: true,
          price: msg.data?.price || 0
        });
      }

      // Юзер виграв/не виграв у другому раунді встановлюється екран результатів
      if ((msg.event == WS_EVENT_ENUM.OTHER_WIN || msg.event == WS_EVENT_ENUM.YOU_WIN || msg.event == WS_EVENT_ENUM.NOT_WIN) && msg.stage == STAGE_ENUM.SECOND_ROUND) {
        setAuctionState({
          type: 'SET_CURRENT_STAGE',
          payload: STAGE_SCREENS_ENUM.RESULTS
        });
        Storage.clear();
        socket.close();
      }
      if (msg.event == WS_EVENT_ENUM.STORE_WIN_DATA) {
        setAuctionState({
          type: 'SET_WIN_DATA',
          payload: msg?.data
        });
        Storage.set('win_data', {
          isWinner: true,
          price: msg.data?.price || 0
        });
      }
    };
    return () => {
      socket.close();
    };
  }, [url]);
  const handleAuctionSendMessage = message => {
    if (!auctionSocket) {
      console.error('WebSocket is not connected');
      return;
    }
    const msg = stringifyObject(message);
    if (!msg) {
      return;
    }
    setAuctionState({
      type: 'RESET_ERROR'
    });
    try {
      auctionSocket.send(msg);
      return false;
    } catch (error) {
      console.error('[handleAuctionSendMessage] error: ', error);
      return true;
    }
  };
  const handleResetAuction = () => {
    setAuctionState({
      type: 'RESET'
    });
    auctionSocket?.close();
    setAuctionSocket(null);
  };
  return {
    auctionSocket,
    auctionState,
    handleAuctionSendMessage,
    handleResetAuction
  };
};

const WidgetContext = /*#__PURE__*/createContext({
  auctionSocket: null,
  auctionState: initialAuctionState,
  cart: [],
  currency: null,
  customerName: null,
  isOpen: false,
  isInfoOpen: false,
  isAuctionStarting: false,
  isCustomUrlScreen: false,
  setIsOpen: () => undefined,
  setIsInfoOpen: () => undefined,
  handleSetSocketUrl: () => undefined,
  handleResetAuction: () => undefined,
  handleAuctionSendMessage: () => false,
  handleAddVariationToCart: () => undefined,
  handleStartAuction: () => undefined,
  handleUseWinData: () => undefined,
  handleToggleCustomUrlScreen: () => undefined
});

const SvgBagsShopping = props => /*#__PURE__*/jsxs("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 20 20",
  ...props,
  children: [/*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M19.72 9.948C18.415.616 17.282 0 10 0 2.708 0 1.574.614.273 9.935c-.568 4.066-.257 6.437 1.04 7.928C2.867 19.65 5.672 20 9.99 20c4.326 0 7.135-.35 8.69-2.14 1.296-1.488 1.607-3.854 1.04-7.912m-2.332 6.788c-1.123 1.291-3.662 1.55-7.397 1.55-3.728 0-6.263-.26-7.385-1.55-.926-1.062-1.122-3.088-.636-6.564C3.15 1.715 3.538 1.715 10 1.715c6.451 0 6.837 0 8.022 8.47.484 3.47.289 5.49-.635 6.55"
  }), /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M12.853 4a.857.857 0 0 0-.857.857 2 2 0 1 1-4 0 .857.857 0 1 0-1.715 0 3.714 3.714 0 0 0 7.43 0A.857.857 0 0 0 12.852 4"
  })]
});

const SvgBucket = props => /*#__PURE__*/jsxs("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 24 24",
  ...props,
  children: [/*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M12 2.75c-.979 0-1.813.625-2.122 1.5a.75.75 0 0 1-1.414-.5 3.751 3.751 0 0 1 7.073 0 .75.75 0 0 1-1.415.5A2.25 2.25 0 0 0 12 2.75M2.75 6a.75.75 0 0 1 .75-.75h17a.75.75 0 0 1 0 1.5h-17A.75.75 0 0 1 2.75 6M5.915 8.45a.75.75 0 1 0-1.497.1l.464 6.952c.085 1.282.154 2.318.316 3.132.169.845.455 1.551 1.047 2.104s1.315.793 2.17.904c.822.108 1.86.108 3.146.108h.879c1.285 0 2.324 0 3.146-.108.854-.111 1.578-.35 2.17-.904.591-.553.877-1.26 1.046-2.104.162-.814.23-1.85.316-3.132l.464-6.952a.75.75 0 0 0-1.497-.1l-.46 6.9c-.09 1.347-.154 2.285-.294 2.99-.137.685-.327 1.047-.6 1.303-.274.256-.648.422-1.34.512-.713.093-1.653.095-3.004.095h-.774c-1.35 0-2.29-.002-3.004-.095-.692-.09-1.066-.256-1.34-.512-.273-.256-.463-.618-.6-1.303-.14-.705-.204-1.643-.294-2.99z"
  }), /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M9.425 10.254a.75.75 0 0 1 .821.671l.5 5a.75.75 0 0 1-1.492.15l-.5-5a.75.75 0 0 1 .671-.821M15.246 11.075a.75.75 0 0 0-1.492-.15l-.5 5a.75.75 0 0 0 1.492.15z"
  })]
});

const SvgDownArrow = props => /*#__PURE__*/jsx("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 12 12",
  ...props,
  children: /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "m2.297 5.129 3.276 3.823a.563.563 0 0 0 .854 0l3.276-3.823a.563.563 0 0 0-.427-.929H2.723c-.48 0-.74.564-.426.929"
  })
});

const SvgHourglass2 = props => /*#__PURE__*/jsx("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 33 33",
  ...props,
  children: /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M23.375 31.625H9.625A4.13 4.13 0 0 1 5.5 27.5v-2.1a4.1 4.1 0 0 1 1.576-3.244l4.45-3.496a1.375 1.375 0 0 1 1.698 2.162l-4.449 3.496A1.37 1.37 0 0 0 8.25 25.4V27.5a1.376 1.376 0 0 0 1.375 1.375h13.75A1.376 1.376 0 0 0 24.75 27.5v-2.1a1.37 1.37 0 0 0-.526-1.082L7.076 10.845A4.1 4.1 0 0 1 5.5 7.6V5.5a4.13 4.13 0 0 1 4.125-4.125h13.75A4.13 4.13 0 0 1 27.5 5.5v2.1a4.1 4.1 0 0 1-1.576 3.244l-4.45 3.496a1.375 1.375 0 0 1-1.698-2.162l4.449-3.496A1.37 1.37 0 0 0 24.75 7.6V5.5a1.376 1.376 0 0 0-1.375-1.375H9.625A1.377 1.377 0 0 0 8.25 5.5v2.1a1.37 1.37 0 0 0 .526 1.082l17.148 13.474a4.1 4.1 0 0 1 1.576 3.243V27.5a4.13 4.13 0 0 1-4.125 4.125"
  })
});

const SvgHourglass = props => /*#__PURE__*/jsxs("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 20 20",
  ...props,
  children: [/*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M17.5 18.333h-1.667v-3.215a4.16 4.16 0 0 0-1.855-3.468L11.502 10l2.476-1.65a4.16 4.16 0 0 0 1.855-3.467V1.667H17.5A.833.833 0 0 0 17.5 0h-15a.833.833 0 1 0 0 1.667h1.667v3.215c0 1.394.696 2.696 1.855 3.467L8.498 10l-2.476 1.65a4.16 4.16 0 0 0-1.855 3.467v3.216H2.5A.833.833 0 1 0 2.5 20h15a.833.833 0 0 0 0-1.667M5.833 4.883V1.667h8.334v3.216c0 .836-.418 1.616-1.113 2.08L10 8.997 6.946 6.963a2.5 2.5 0 0 1-1.113-2.08m0 13.45v-3.215c0-.837.418-1.617 1.113-2.08L10 11.002l3.054 2.035a2.5 2.5 0 0 1 1.113 2.08v3.216z"
  }), /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M10.693 7.458a.833.833 0 0 0-.23-1.156l-2.13-1.419v-.717a.833.833 0 1 0-1.666 0v.717c0 .557.278 1.076.74 1.386l2.13 1.42c.384.255.901.152 1.156-.231M12.593 13.731l-2.13-1.42a.833.833 0 1 0-.925 1.387l2.129 1.419v.717a.833.833 0 1 0 1.666 0v-.717c0-.557-.278-1.076-.74-1.386"
  })]
});

const SvgInfo = props => /*#__PURE__*/jsxs("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 20 20",
  ...props,
  children: [/*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M10 18.333c-4.595 0-8.333-3.738-8.333-8.333S5.405 1.667 10 1.667 18.333 5.405 18.333 10 14.595 18.333 10 18.333m0-15A6.674 6.674 0 0 0 3.333 10 6.674 6.674 0 0 0 10 16.667 6.674 6.674 0 0 0 16.667 10 6.674 6.674 0 0 0 10 3.333"
  }), /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M10 13.958a.834.834 0 0 1-.833-.833V9.557a.834.834 0 0 1 1.666 0v3.568c0 .46-.373.833-.833.833M10 7.709a.88.88 0 0 1-.592-.242.88.88 0 0 1-.241-.592.8.8 0 0 1 .066-.316q.063-.15.175-.276a.873.873 0 0 1 1.184 0c.15.159.241.375.241.592a.88.88 0 0 1-.241.592 1 1 0 0 1-.275.175.7.7 0 0 1-.317.066"
  })]
});

const SvgLogo = props => /*#__PURE__*/jsx("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 196 38",
  ...props,
  children: /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M113.715 28.143q0-.352.12-.657.132-.316.347-.547.228-.231.528-.365.311-.134.658-.134t.647.134q.312.134.54.365.227.231.359.547.132.305.132.657 0 .366-.132.67a1.8 1.8 0 0 1-.359.535 1.5 1.5 0 0 1-.54.352q-.299.134-.647.134-.347 0-.658-.134a1.6 1.6 0 0 1-.528-.352 1.9 1.9 0 0 1-.347-.536 1.8 1.8 0 0 1-.12-.669M127.657 29.652q-.371 0-.563-.11-.192-.12-.324-.474l-.251-1.01a9 9 0 0 1-.923.767 6 6 0 0 1-.946.56q-.48.23-1.043.34a5.7 5.7 0 0 1-1.222.121q-.742 0-1.389-.206a3.1 3.1 0 0 1-1.103-.62 3.1 3.1 0 0 1-.743-1.047q-.263-.62-.263-1.46 0-.718.371-1.399.384-.681 1.246-1.216.874-.547 2.289-.9 1.425-.354 3.51-.402v-.827q0-1.338-.563-1.995t-1.653-.657q-.744 0-1.246.194a5.3 5.3 0 0 0-.875.402 13 13 0 0 0-.659.413 1.1 1.1 0 0 1-.611.183.77.77 0 0 1-.455-.134 1.3 1.3 0 0 1-.3-.353l-.467-.851q2.073-1.959 4.936-1.959 1.054 0 1.869.353a3.6 3.6 0 0 1 1.378.973q.563.633.851 1.508.299.864.299 1.923v7.883zm-4.493-1.63q1.007 0 1.725-.377.732-.39 1.414-1.108v-2.311q-1.377.06-2.324.231t-1.534.45q-.587.28-.85.657a1.4 1.4 0 0 0-.252.815q0 .438.132.755.143.304.383.51.252.195.575.292.336.086.731.086M134.281 17.243v7.895q0 1.254.563 1.947.575.693 1.737.693.851 0 1.582-.389a5.5 5.5 0 0 0 1.39-1.095v-9.05h2.576v12.408h-1.558q-.515 0-.659-.499l-.192-1.156a6.8 6.8 0 0 1-1.725 1.338q-.935.511-2.18.511-1.006 0-1.774-.34a3.6 3.6 0 0 1-1.294-.961 4.2 4.2 0 0 1-.778-1.485 6.6 6.6 0 0 1-.264-1.922v-7.895zM153.895 19.676q-.12.159-.227.244a.5.5 0 0 1-.312.085.8.8 0 0 1-.431-.146 7 7 0 0 0-.527-.317 3.7 3.7 0 0 0-.731-.328q-.431-.146-1.079-.146-.839 0-1.473.304a2.9 2.9 0 0 0-1.055.876q-.419.56-.635 1.375a7.4 7.4 0 0 0-.203 1.812q0 1.047.227 1.862.228.814.647 1.374.432.56 1.031.852.61.292 1.366.292.742 0 1.21-.183.467-.182.779-.401.31-.219.527-.402a.75.75 0 0 1 .479-.182q.311 0 .479.243l.731.961a4.8 4.8 0 0 1-.982.925q-.54.377-1.139.62a6 6 0 0 1-1.246.329q-.646.11-1.306.11a5.4 5.4 0 0 1-2.132-.427 5.2 5.2 0 0 1-1.726-1.253q-.73-.826-1.162-2.007-.419-1.192-.419-2.713 0-1.375.383-2.542.383-1.18 1.115-2.032a5.1 5.1 0 0 1 1.833-1.326q1.09-.486 2.516-.486 1.33 0 2.336.437a5.7 5.7 0 0 1 1.809 1.241zM160.688 29.846q-1.522 0-2.348-.863-.815-.876-.815-2.458V19.3h-1.342a.55.55 0 0 1-.371-.134q-.156-.145-.156-.426v-1.058l1.977-.292.563-3.589a.66.66 0 0 1 .203-.328.54.54 0 0 1 .384-.134h1.318v4.075h8.53v12.239h-2.576V19.299h-5.954v7.044q0 .67.323 1.022.324.353.863.353.3 0 .515-.073.216-.086.372-.17a10 10 0 0 0 .263-.171.4.4 0 0 1 .228-.085q.215 0 .347.243l.767 1.277a4.2 4.2 0 0 1-1.414.828 5.1 5.1 0 0 1-1.677.28m8.471-16.41q0 .353-.144.668a1.8 1.8 0 0 1-.372.548q-.239.231-.563.377-.31.135-.659.134-.347 0-.659-.134a2.1 2.1 0 0 1-.539-.377 2.1 2.1 0 0 1-.371-.547 1.7 1.7 0 0 1-.132-.67 1.75 1.75 0 0 1 1.042-1.618q.312-.146.659-.146t.659.146q.324.135.563.377.24.232.372.56.144.317.144.681M177.171 17.049q1.353 0 2.444.45 1.103.45 1.869 1.277.778.826 1.198 2.007.42 1.18.419 2.652 0 1.473-.419 2.652a5.8 5.8 0 0 1-1.198 2.02 5.2 5.2 0 0 1-1.869 1.277q-1.09.45-2.444.45-1.367 0-2.468-.45a5.3 5.3 0 0 1-1.87-1.277 5.8 5.8 0 0 1-1.198-2.02q-.419-1.179-.419-2.652 0-1.471.419-2.652.42-1.18 1.198-2.007a5.3 5.3 0 0 1 1.87-1.277q1.101-.45 2.468-.45m0 10.742q1.653 0 2.456-1.12.814-1.131.814-3.224t-.814-3.223q-.803-1.144-2.456-1.144-1.678 0-2.492 1.144-.816 1.13-.815 3.223 0 2.093.815 3.224.814 1.12 2.492 1.12M185.576 29.652V17.243h1.558q.527 0 .671.499l.18 1.156q.383-.414.802-.755.431-.34.911-.584a4.8 4.8 0 0 1 1.018-.377q.552-.133 1.186-.133 1.006 0 1.762.34.766.34 1.282.961.527.621.79 1.496.264.864.264 1.91v7.896h-2.564v-7.896q0-1.253-.575-1.946-.563-.693-1.725-.693-.863 0-1.606.401a5.6 5.6 0 0 0-1.378 1.095v9.039zM46.087 2.864C47.274.622 49.347-.371 51.752.125c1.582.337 3.149 1.858 3.592 3.475.095.336.174 1.265.174 2.066v1.441l1.82-.048c2.151-.064 3.528.257 5.554 1.266 1.993.992 4.019 2.914 4.905 4.676.221.432.427.752.459.72.031-.032.284-.657.553-1.41.902-2.497 2.263-4.323 3.703-4.98 1.044-.48 2.658-.4 3.734.16 1.013.513 2.12 1.778 2.358 2.691.269.945.206 2.274-.158 3.411-.27.897-.285 1.137-.127 1.73.19.688.902 1.473 1.345 1.473.49 0 1.203-.529 1.424-1.04.3-.738.27-1.41-.095-2.611-.395-1.265-.395-1.666 0-2.947 1.076-3.523 5.633-4.324 7.88-1.361.744.96 1.93 3.235 1.946 3.715 0 .208.095.096.222-.288.854-2.338 2.12-4.084 3.45-4.756 2.484-1.265 5.364-.064 6.297 2.642.38 1.105.38 1.826-.016 3.09-.38 1.234-.395 1.81-.063 2.531.253.544.918 1.025 1.392 1.025.443 0 1.187-.817 1.377-1.49.142-.544.111-.832-.174-1.84-.412-1.394-.38-2.98.063-3.86.776-1.506 2.5-2.595 4.146-2.595 2.421 0 4.177 1.746 5.522 5.51a14.84 14.84 0 0 1 0 9.992c-1.028 2.882-1.345 3.267-7.421 9.448C99.411 38.24 99.744 38 97.449 38c-1.44 0-2.294-.353-3.338-1.378-.934-.912-1.44-2.193-1.44-3.603.016-1.313.57-2.578 1.63-3.667l.79-.817-.6-.528c-1.346-1.185-2.944-3.603-3.387-5.093l-.206-.688-.316.848c-.839 2.178-2.547 4.468-4.351 5.798-2.437 1.81-5.823 2.594-8.592 2.001-1.187-.256-3.133-1.137-4.114-1.825-1.74-1.265-4.13-4.308-4.478-5.733-.127-.513-.253-.433-.554.368-.728 1.874-2.737 4.308-4.525 5.445-3.64 2.322-7.817 2.562-11.678.656-2.294-1.137-4.067-2.882-5.27-5.236l-.6-1.17-.602 1.154c-1.17 2.338-2.911 4.068-5.237 5.236-3.845 1.922-8.054 1.698-11.71-.64-1.202-.769-3.053-2.706-3.718-3.876-.395-.688-.49-.784-.57-.528-.68 2.114-1.914 4.356-2.863 5.205-1.567 1.377-3.608 1.505-5.396.336-1.836-1.217-2.469-3.107-1.804-5.477.538-1.954.364-2.93-.601-3.347-1.013-.416-2.057.352-2.39 1.762-.348 1.521-1.281 3.891-1.914 4.82-.744 1.105-1.582 1.858-2.785 2.482-.807.4-1.092.464-2.263.464-1.012 0-1.503-.08-1.978-.32-.886-.432-2.057-1.697-2.373-2.562-.364-.961-.253-2.899.221-3.972.807-1.777.855-2.322.95-11.722l.095-8.808.427-.817C2.463 1.711 3.76.526 4.709.221c.982-.32 2.738-.224 3.656.193 1.06.48 2.104 1.585 2.516 2.674.253.704.332 1.265.332 2.466v1.553l2.184.016c2.057 0 2.23.032 3.496.529 2.912 1.12 5.554 3.603 6.757 6.341l.396.93.648-1.266c1.203-2.37 3.007-4.196 5.27-5.349C31.957 7.3 33.508 6.98 35.802 7.06c1.693.064 2.089.144 3.418.64 2.468.914 4.51 2.483 5.823 4.453l.649.977.047-4.853c.048-4.387.08-4.9.348-5.412m52.39 7.558c-.6-1.025-2.072-1.44-3.021-.848-1.124.688-2.279 2.914-2.77 5.316-.395 1.954-.348 4.132.143 6.006.68 2.578 2.468 5.124 4.573 6.485.585.369 1.108.705 1.14.737.046.032-.713.865-1.678 1.858-1.63 1.665-1.772 1.857-1.867 2.562-.159 1.073.11 1.874.854 2.562.696.625 1.44.849 2.358.689.506-.096 1.266-.801 5.965-5.59 5.174-5.252 5.412-5.524 6.045-6.837 1.186-2.402 1.693-5.285 1.329-7.463-.443-2.594-1.677-5.412-2.722-6.181-.997-.753-2.5-.449-3.244.656-.474.705-.49 1.49-.063 2.579.665 1.73.301 3.539-1.013 4.9-.664.688-.949.865-1.661 1.009-1.994.416-3.64-.545-4.351-2.562-.364-1.01-.364-2.45-.016-3.283s.348-1.986 0-2.595m-89.78-6.71c-.585-1.28-2.437-1.905-3.576-1.185-.696.433-1.17 1.01-1.345 1.634-.095.32-.158 3.843-.158 8.6 0 8.791-.016 9.064-.965 11.85-.68 2.066-.57 2.946.49 3.715 1.36.977 3.386.272 4.668-1.633.364-.545.791-1.602 1.203-2.93.949-3.012 1.202-3.428 2.658-4.293.854-.528 2.563-.48 3.513.08.727.433 1.408 1.265 1.708 2.098.27.72.206 2.226-.158 3.7l-.348 1.345.348.72c.27.545.523.817 1.029 1.057.364.192.823.337 1.012.337 1.393 0 2.595-1.57 3.608-4.645.396-1.233.443-1.585.443-3.683 0-2.274 0-2.354-.57-3.971-.68-1.954-1.503-3.283-2.769-4.532-2.579-2.53-5.79-3.283-9.114-2.162-.664.224-1.265.416-1.297.416-.048 0-.08-1.313-.08-2.93 0-2.515-.047-3.011-.3-3.588M85.36 9.27c-.696 0-1.724.56-2.057 1.137-.364.625-.364 1.778 0 2.627.776 1.841-.142 4.66-1.803 5.508-1.93.977-4.067.209-5.095-1.841-.507-1.025-.602-2.45-.238-3.427.46-1.217.475-2.226.048-2.883-.665-1.009-1.852-1.361-2.928-.88-1.345.576-2.864 4.083-3.149 7.174-.363 4.051 1.741 8.535 5 10.665 2.184 1.425 5.032 1.794 7.39.93 5.127-1.859 7.99-8.2 6.393-14.19-.728-2.754-2.263-4.82-3.56-4.82m-45.127 1.41c-1.82-1.105-4.557-1.666-6.314-1.314-2.88.593-4.794 1.762-6.36 3.876-1.44 1.937-2.01 4.244-1.773 7.078.222 2.514 2.026 5.413 4.32 6.918 2.215 1.442 5.475 1.906 7.959 1.121 2.61-.832 4.605-2.546 5.807-5.028.886-1.794 1.108-2.915.997-4.933a9.56 9.56 0 0 0-4.636-7.718m12.77-6.774c-.729-1.602-2.343-2.146-3.783-1.266-.395.24-.791.657-.98 1.025-.302.609-.317.961-.317 8.712 0 7.623.015 8.12.316 9.112.87 2.85 2.089 4.484 4.51 5.99 2.737 1.713 6.756 1.665 9.747-.129 1.994-1.185 3.94-3.843 4.399-6.037.221-1.089.221-3.46 0-4.548-.665-3.17-3.323-6.037-6.52-7.03-2.009-.64-4.651-.529-6.55.272l-.522.208V7.38c0-2.418-.048-2.931-.3-3.475m.727 16.478c.016-3.203 3.006-5.22 5.554-3.731 2.895 1.665 2.674 6.486-.348 7.75-2.58 1.09-5.222-.944-5.206-4.019m-21.583-2.322c1.013-1.713 3.007-2.386 4.636-1.57.823.401 1.583 1.234 2.01 2.21.253.577.3.962.237 2.002-.079 1.458-.285 1.97-1.187 2.915-.98 1.009-2.626 1.345-3.955.785-2.231-.945-3.086-4.068-1.741-6.342m3.655.497c-.522-.209-.696-.193-1.187.08-.759.416-1.123 1.633-.76 2.594.491 1.297 1.647 1.585 2.501.608.395-.464.49-.704.49-1.329 0-.897-.443-1.73-1.044-1.953m22.39.08c-.506-.273-.696-.289-1.203-.08-.949.384-1.329 2.241-.648 3.138.474.64.601.705 1.25.705.838 0 1.566-.929 1.566-2.034 0-.625-.474-1.473-.965-1.73"
  })
});

const SvgSpeakerOff = props => /*#__PURE__*/jsx("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 24 24",
  ...props,
  children: /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    fillRule: "evenodd",
    d: "M16.25 6.003c0-1.03-1.176-1.618-2-1l-3.085 2.313a.75.75 0 0 1-.9-1.2l3.085-2.313c1.813-1.358 4.4-.066 4.4 2.2V13a.75.75 0 1 1-1.5 0zM3.47 3.47a.75.75 0 0 1 1.06 0l16 16a.75.75 0 0 1-1.06 1.06l-1.812-1.812c-.477 1.8-2.698 2.685-4.308 1.479l-4.267-3.2a1.25 1.25 0 0 0-.75-.249H6a2.75 2.75 0 0 1-2.75-2.75v-3.997A2.75 2.75 0 0 1 6 7.25h.191L3.47 4.532a.75.75 0 0 1 0-1.061M7.69 8.752H6c-.69 0-1.25.56-1.25 1.249v3.998c0 .69.56 1.249 1.25 1.249h2.334a2.75 2.75 0 0 1 1.65.55l4.266 3.198c.824.618 2 .03 2-.999v-.686z",
    clipRule: "evenodd"
  })
});

const SvgSpeakerOn = props => /*#__PURE__*/jsx("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 24 24",
  ...props,
  children: /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    fillRule: "evenodd",
    d: "M14.25 6.003c0-1.03-1.176-1.618-2-1L7.983 8.202a2.75 2.75 0 0 1-1.65.55H4c-.69 0-1.25.56-1.25 1.249v3.998c0 .69.56 1.249 1.25 1.249h2.334a2.75 2.75 0 0 1 1.65.55l4.266 3.198c.824.618 2 .03 2-.999zm-2.9-2.2c1.813-1.358 4.4-.066 4.4 2.2v11.994c0 2.266-2.588 3.558-4.4 2.2l-4.267-3.2a1.25 1.25 0 0 0-.75-.249H4a2.75 2.75 0 0 1-2.75-2.75v-3.997A2.75 2.75 0 0 1 4 7.25h2.334c.27 0 .533-.087.75-.25zm5.915 3.148a.75.75 0 0 1 .884-.586 5.752 5.752 0 0 1 0 11.27.75.75 0 0 1-.298-1.47 4.252 4.252 0 0 0 0-8.33.75.75 0 0 1-.586-.884m.086 2.94a.75.75 0 0 1 1.024-.273 2.75 2.75 0 0 1 0 4.764.75.75 0 1 1-.75-1.299 1.25 1.25 0 0 0 0-2.166.75.75 0 0 1-.274-1.025",
    clipRule: "evenodd"
  })
});

const SvgX = props => /*#__PURE__*/jsx("svg", {
  xmlns: "http://www.w3.org/2000/svg",
  width: "1em",
  height: "1em",
  fill: "none",
  viewBox: "0 0 20 20",
  ...props,
  children: /*#__PURE__*/jsx("path", {
    fill: "currentColor",
    d: "M13.97 15.03a.75.75 0 1 0 1.06-1.06L11.06 10l3.97-3.97a.75.75 0 0 0-1.06-1.06L10 8.94 6.03 4.97a.75.75 0 0 0-1.06 1.06L8.94 10l-3.97 3.97a.75.75 0 1 0 1.06 1.06L10 11.06z"
  })
});

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var classnames = {exports: {}};

/*!
	Copyright (c) 2018 Jed Watson.
	Licensed under the MIT License (MIT), see
	http://jedwatson.github.io/classnames
*/

var hasRequiredClassnames;

function requireClassnames () {
	if (hasRequiredClassnames) return classnames.exports;
	hasRequiredClassnames = 1;
	(function (module) {
		/* global define */

		(function () {

			var hasOwn = {}.hasOwnProperty;

			function classNames () {
				var classes = '';

				for (var i = 0; i < arguments.length; i++) {
					var arg = arguments[i];
					if (arg) {
						classes = appendClass(classes, parseValue(arg));
					}
				}

				return classes;
			}

			function parseValue (arg) {
				if (typeof arg === 'string' || typeof arg === 'number') {
					return arg;
				}

				if (typeof arg !== 'object') {
					return '';
				}

				if (Array.isArray(arg)) {
					return classNames.apply(null, arg);
				}

				if (arg.toString !== Object.prototype.toString && !arg.toString.toString().includes('[native code]')) {
					return arg.toString();
				}

				var classes = '';

				for (var key in arg) {
					if (hasOwn.call(arg, key) && arg[key]) {
						classes = appendClass(classes, key);
					}
				}

				return classes;
			}

			function appendClass (value, newClass) {
				if (!newClass) {
					return value;
				}
			
				if (value) {
					return value + ' ' + newClass;
				}
			
				return value + newClass;
			}

			if (module.exports) {
				classNames.default = classNames;
				module.exports = classNames;
			} else {
				window.classNames = classNames;
			}
		}()); 
	} (classnames));
	return classnames.exports;
}

var classnamesExports = requireClassnames();
var cn = /*@__PURE__*/getDefaultExportFromCjs(classnamesExports);

const paragraphSizes = {
  base: 'text-base',
  xs: 'text-xs',
  lg: 'text-sm leading-5'
};
const paragraphVariants = {
  error: 'text-error',
  gray: 'text-grayscale-bold',
  gradient: 'text-with-gradient'
};
const Paragraph = ({
  className,
  tag = 'p',
  variant,
  size = 'base',
  ...rest
}) => {
  return /*#__PURE__*/createElement(tag, {
    className: cn(className, paragraphSizes[size], variant && paragraphVariants[variant]),
    ...rest
  });
};
Paragraph.displayName = 'Paragraph';

const titleVariants = {
  error: 'text-error',
  gray: 'text-grayscale-bold',
  gradient: 'text-with-gradient'
};
const titleSizes = {
  sm: 'text-xs leading-[14px]',
  md: 'text-base leading-5',
  xl: 'text-xl font-semibold leading-6',
  '3xl': 'text-2.5xl leading-8.5 font-semibold'
};
const Title = ({
  className,
  tag = 'h2',
  variant,
  size = 'xl',
  ...rest
}) => {
  return /*#__PURE__*/createElement(tag, {
    className: cn('text-foreground-primary', titleSizes[size], variant && titleVariants[variant], className),
    ...rest
  });
};
Title.displayName = 'Title';

var en = {
  'info-dialog.title': 'Auction guide',
  'info-dialog.first-subtitle': 'Lorem ipsum 1',
  'info-dialog.first-description': 'Lorem ipsum dolor sit amet consectetur. Varius tempus ipsum etiam leo hendrerit quam duis vitae ac. Diam amet faucibus scelerisque in cras et. Praesent penatibus cursus in tortor elit magnis ipsum. Semper leo dui neque egestas vitae consequat morbi duis.',
  'info-dialog.second-subtitle': 'Lorem ipsum 2',
  'info-dialog.second-description': 'Lorem ipsum dolor sit amet consectetur. Varius tempus ipsum etiam leo hendrerit quam duis vitae ac. Diam amet faucibus scelerisque in cras et. Praesent penatibus cursus in tortor elit magnis ipsum. Semper leo dui neque egestas vitae consequat morbi duis.',
  'cart.title': 'Auction cart',
  'cart.total-start-price': 'Auction cart',
  'cart.input.label': 'Enter your name to take part in auction',
  'cart.input.placeholder': 'Your name',
  'cart.input.error': 'Name is required to start auction',
  'cart.start-auction': 'Instant Auction',
  'cart.start-auction.loading': 'Waiting to start...',
  'cart.to-catalog': 'Back to catalog',
  'bidding-preparation.title': 'Get ready to start bidding',
  'bidding-preparation.subtitle': 'Participants',
  'bidding-preparation.description': 'Waiting for more participants...',
  'first-round.other-bidders': 'Other bidders',
  'first-round.title': 'Auction bidding round 1',
  'first-round.description': 'Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque. Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque. Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque',
  'first-round.auction-price.title': 'Starting price',
  'first-round.auction-price.description': 'Become the only one to grab the lowest price!',
  'second-round.title': 'Auction bidding round 2',
  'second-round.description': 'Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque. Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque. Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque',
  'second-round.starting-price.title': 'Starting price',
  'second-round.auction-price.title': 'Your price now',
  'second-round.auction-price.description': 'Unbroked bid wins!',
  'auction-results.title': 'Auction results',
  'auction-results.description': 'Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum',
  'auction-results.prev-price': 'Previous total price',
  'auction-results.current-price': 'Current total price',
  'auction-results.you-win': 'You have won!',
  'auction-results.you-lose': 'The other one won!',
  'products.start-price': 'Starting price',
  'buttons.by-instant-auction': 'Buy on Instant Auction',
  'buttons.buy-this-price': 'Buy at this price',
  'buttons.try-again': 'Try again',
  'buttons.catch-price': 'Catch the price',
  'buttons.show-more': 'Show more',
  'buttons.hide': 'Hide'
};

var uk = {
  'info-dialog.title': 'Посібник по аукціону',
  'info-dialog.first-subtitle': 'Lorem ipsum 1',
  'info-dialog.first-description': 'Lorem ipsum dolor sit amet consectetur. Varius tempus ipsum etiam leo hendrerit quam duis vitae ac. Diam amet faucibus scelerisque in cras et. Praesent penatibus cursus in tortor elit magnis ipsum. Semper leo dui neque egestas vitae consequat morbi duis.',
  'info-dialog.second-subtitle': 'Lorem ipsum 2',
  'info-dialog.second-description': 'Lorem ipsum dolor sit amet consectetur. Varius tempus ipsum etiam leo hendrerit quam duis vitae ac. Diam amet faucibus scelerisque in cras et. Praesent penatibus cursus in tortor elit magnis ipsum. Semper leo dui neque egestas vitae consequat morbi duis.',
  'cart.title': 'Кошик аукціону',
  'cart.total-start-price': 'Кошик аукціону',
  'cart.input.label': "Введіть своє ім'я, для участs в аукціоні",
  'cart.input.placeholder': "Ваше ім'я",
  'cart.input.error': 'Ім\'я обов\'язкове для початку аукціону',
  'cart.start-auction': 'Миттєвий аукціон',
  'cart.start-auction.loading': 'Очікування початку...',
  'cart.to-catalog': 'Повернутися до каталогу',
  'bidding-preparation.title': 'Підготуйтеся до торгів',
  'bidding-preparation.subtitle': 'Учасники',
  'bidding-preparation.description': 'Очікуємо на інших учасників...',
  'first-round.other-bidders': 'Інші учасники',
  'first-round.title': 'Раунд 1 аукціону',
  'first-round.description': 'Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque. Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque. Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque',
  'first-round.auction-price.title': 'Стартова ціна',
  'first-round.auction-price.description': 'Станьте єдиним, хто отримає найнижчу ціну!',
  'second-round.title': 'Раунд 2 аукціону',
  'second-round.description': 'Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque. Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque. Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum viverra sed. Maecenas ac consequat quisque',
  'second-round.starting-price.title': 'Стартова ціна',
  'second-round.auction-price.title': 'Ваша ціна зараз',
  'second-round.auction-price.description': 'Перемагає незламна ставка!',
  'auction-results.title': 'Результати аукціону',
  'auction-results.description': 'Lorem ipsum dolor sit amet consectetur. Neque ipsum enim bibendum nisl ipsum',
  'auction-results.prev-price': 'Попередня ціна',
  'auction-results.current-price': 'Поточна ціна',
  'auction-results.you-win': 'Вітання, ви виграли!',
  'auction-results.you-lose': 'Нажаль, переміг інший учасник!',
  'products.start-price': 'Стартова ціна',
  'buttons.by-instant-auction': 'Купити на миттєвому аукціоні',
  'buttons.buy-this-price': 'Купити за цією ціною',
  'buttons.try-again': 'Спробувати ще раз',
  'buttons.catch-price': 'Зловити ціну',
  'buttons.show-more': 'Розгорнути',
  'buttons.hide': 'Сховати'
};

const config = {
  translations: {
    en,
    uk
  },
  defaultLocale: 'en',
  locales: ['en', 'uk']
};
const i18n = {
  config,
  _currentLanguage: config.defaultLocale,
  _listeners: new Set(),
  t: function (key, lang) {
    const language = lang || this._currentLanguage;
    const dictionary = config.translations[language] || config.translations[config.defaultLocale];
    return dictionary[key] || key;
  },
  setLang: function (lang) {
    if (config.locales.includes(lang) && this._currentLanguage !== lang) {
      this._currentLanguage = lang;
      this._notifyListeners(lang);
    } else if (!config.locales.includes(lang)) {
      console.log('[Widget i18n] Language is not supported:', lang);
    }
  },
  subscribe: function (listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  },
  // Сповіщення всіх підписників про зміну мови
  _notifyListeners: function (newLanguage) {
    this._listeners.forEach(listener => listener(newLanguage));
  },
  get lang() {
    return this._currentLanguage;
  },
  set lang(newLang) {
    this.setLang(newLang);
  }
};

function useI18n() {
  const [currentLanguage, setCurrentLanguage] = useState(i18n.lang);
  useEffect(() => {
    const unsubscribe = i18n.subscribe(newLanguage => {
      setCurrentLanguage(newLanguage);
    });
    return unsubscribe;
  }, []);
  return {
    t: i18n.t.bind(i18n),
    setLang: i18n.setLang.bind(i18n),
    lang: currentLanguage
  };
}

const InfoDialog = ({
  onClose
}) => {
  const {
    t
  } = useI18n();
  const handleClose = () => {
    onClose?.();
  };
  return /*#__PURE__*/jsxs(Fragment, {
    children: [/*#__PURE__*/jsx("div", {
      className: "fixed indent-0  w-full h-full bg-black opacity-25 z-[99998] !block",
      onClick: handleClose
    }), /*#__PURE__*/jsxs("div", {
      className: "fixed bottom-20 right-4 bg-background-secondary foreground-secondary w-[343px] p-5 pb-8 rounded-3xl flex flex-col gap-4 z-[99999]",
      onClick: event => event.stopPropagation(),
      children: [/*#__PURE__*/jsx(Title, {
        className: 'font-semibold',
        size: 'md',
        children: t('info-dialog.title')
      }), /*#__PURE__*/jsxs("div", {
        className: 'flex flex-col gap-3',
        children: [/*#__PURE__*/jsx(Title, {
          className: 'font-normal',
          size: 'md',
          children: t('info-dialog.first-subtitle')
        }), /*#__PURE__*/jsx(Paragraph, {
          size: 'xs',
          className: 'text-foreground-secondary',
          children: t('info-dialog.first-description')
        })]
      }), /*#__PURE__*/jsxs("div", {
        className: 'flex flex-col gap-3',
        children: [/*#__PURE__*/jsx(Title, {
          className: 'font-normal',
          size: 'md',
          children: t('info-dialog.second-subtitle')
        }), /*#__PURE__*/jsx(Paragraph, {
          size: 'xs',
          className: 'text-foreground-secondary',
          children: t('info-dialog.second-description')
        })]
      }), /*#__PURE__*/jsx("button", {
        className: "absolute bottom-3.5 right-3.5",
        onClick: handleClose,
        "aria-label": "InfoClose",
        children: /*#__PURE__*/jsx(SvgX, {
          width: 20,
          height: 20,
          className: 'text-foreground-secondary'
        })
      })]
    })]
  });
};
InfoDialog.displayName = 'InfoDialog';

const ButtonInfo = ({
  className,
  ...rest
}) => {
  return /*#__PURE__*/jsx("button", {
    className: cn('rounded-full bg-background-secondary h-10 w-10 flex items-center justify-center', className),
    ...rest,
    children: /*#__PURE__*/jsx(SvgInfo, {
      width: "20",
      height: "20",
      className: 'text-foreground-primary'
    })
  });
};
ButtonInfo.displayName = 'ButtonInfo';

const ButtonCart = ({
  className,
  cartQuantity = 0,
  ...rest
}) => {
  return /*#__PURE__*/jsx("div", {
    className: "p-[1px] rounded-[32px] bg-gradient-primary",
    children: /*#__PURE__*/jsxs("button", {
      className: cn('relative bg-background-primary flex items-center justify-center h-14 w-14 text-background-primary border-none rounded-[32px] cursor-pointer', className),
      ...rest,
      children: [/*#__PURE__*/jsx(SvgBagsShopping, {
        width: "20",
        height: "20",
        className: 'text-foreground-primary'
      }), !!cartQuantity && /*#__PURE__*/jsx("span", {
        className: "bg-error h-5 w-5 rounded-full text-xs flex items-center justify-center absolute right-0 top-0",
        children: cartQuantity
      })]
    })
  });
};
ButtonCart.displayName = 'ButtonCart';

const buttonVariants = {
  root: 'flex items-center justify-center cursor-pointer text-base font-semibold gap-2 transition',
  primary: 'px-5 py-3 bg-accent h-11 text-foreground-accent border-none rounded-[32px]',
  secondary: 'h-11 text-foreground-primary border border-border rounded-[32px]',
  icon: ''
};
const Button = ({
  variant = 'primary',
  className,
  children,
  disabled,
  onClick,
  onKeyDown,
  ...rest
}) => {
  const handleClick = e => {
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick?.(e);
  };
  const handleKeyDown = e => {
    if (disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
    }
    onKeyDown?.(e);
  };
  return /*#__PURE__*/jsx("button", {
    className: cn(buttonVariants.root, buttonVariants[variant], className, {
      'cursor-not-allowed opacity-50': disabled,
      'hover:bg-opacity-80 active:bg-opacity-80': !disabled
    }),
    onClick: handleClick,
    onKeyDown: handleKeyDown,
    ...rest,
    children: children
  });
};
Button.displayName = 'Button';

const FloatTriggers = ({
  className
}) => {
  const {
    auctionState,
    cart,
    isInfoOpen,
    isAuctionStarting,
    setIsOpen,
    setIsInfoOpen,
    handleAddVariationToCart
  } = useContext(WidgetContext);
  const {
    t
  } = useI18n();
  const handleOpenAuctionWidget = () => {
    setIsOpen(true);
  };
  return /*#__PURE__*/jsxs("div", {
    children: [isInfoOpen && /*#__PURE__*/jsx(InfoDialog, {
      onClose: () => setIsInfoOpen(false)
    }), /*#__PURE__*/jsxs("div", {
      className: cn('fixed bottom-0 right-0 flex flex-col flex-wrap max-w-full items-end gap-2 z-[9999] p-4', className),
      children: [!isInfoOpen && /*#__PURE__*/jsx(ButtonInfo, {
        onClick: () => setIsInfoOpen(true)
      }), /*#__PURE__*/jsxs("div", {
        className: "flex gap-2 flex-wrap max-w-full",
        children: [cart?.length > 0 && /*#__PURE__*/jsx(ButtonCart, {
          cartQuantity: cart.length,
          onClick: handleOpenAuctionWidget
        }), /*#__PURE__*/jsxs(Button, {
          className: 'relative h-14',
          onClick: handleAddVariationToCart,
          children: [(auctionState.isAuctionRunning || isAuctionStarting) && /*#__PURE__*/jsx("span", {
            className: 'w-3.5 h-auto aspect-square rounded-full bg-error absolute top-0.5 right-0.5 border-2 border-white'
          }), /*#__PURE__*/jsx(SvgHourglass, {
            width: "18",
            height: "20"
          }), !auctionState.isAuctionRunning && !isAuctionStarting && /*#__PURE__*/jsx("span", {
            className: 'font-normal',
            children: t('buttons.by-instant-auction')
          })]
        })]
      })]
    })]
  });
};
FloatTriggers.displayName = 'FloatTriggers';

const ProgressLine = ({
  initialProgress = 0,
  duration = 2
}) => {
  return /*#__PURE__*/jsx("div", {
    className: 'bg-background-secondary rounded-4xl h-3',
    children: /*#__PURE__*/jsx("div", {
      className: 'bg-accent h-full rounded-[inherit] !block',
      style: {
        width: `${initialProgress}%`,
        animation: `progress-animation-line ${duration}s linear 0s 1 forwards`
      }
    })
  });
};
ProgressLine.displayName = 'ProgressLine';

const Logo = ({
  className,
  onClick,
  onContextMenu
}) => {
  return /*#__PURE__*/jsx(SvgLogo, {
    width: "196",
    height: "38",
    className: cn('text-grayscale-dark mx-auto', className),
    onClick: onClick,
    onContextMenu: event => {
      event.preventDefault();
      onContextMenu?.();
    }
  });
};
Logo.displayName = 'Logo';

var currenciesData = {
  USD: {
    symbol: '$',
    name: 'US Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'USD',
    name_plural: 'US dollars'
  },
  CAD: {
    symbol: 'CA$',
    name: 'Canadian Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'CAD',
    name_plural: 'Canadian dollars'
  },
  EUR: {
    symbol: '€',
    name: 'Euro',
    symbol_native: '€',
    decimal_digits: 2,
    rounding: 0,
    code: 'EUR',
    name_plural: 'euros'
  },
  AED: {
    symbol: 'AED',
    name: 'United Arab Emirates Dirham',
    symbol_native: 'د.إ.‏',
    decimal_digits: 2,
    rounding: 0,
    code: 'AED',
    name_plural: 'UAE dirhams'
  },
  AFN: {
    symbol: 'Af',
    name: 'Afghan Afghani',
    symbol_native: '؋',
    decimal_digits: 0,
    rounding: 0,
    code: 'AFN',
    name_plural: 'Afghan Afghanis'
  },
  ALL: {
    symbol: 'ALL',
    name: 'Albanian Lek',
    symbol_native: 'Lek',
    decimal_digits: 0,
    rounding: 0,
    code: 'ALL',
    name_plural: 'Albanian lekë'
  },
  AMD: {
    symbol: 'AMD',
    name: 'Armenian Dram',
    symbol_native: 'դր.',
    decimal_digits: 0,
    rounding: 0,
    code: 'AMD',
    name_plural: 'Armenian drams'
  },
  ARS: {
    symbol: 'AR$',
    name: 'Argentine Peso',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'ARS',
    name_plural: 'Argentine pesos'
  },
  AUD: {
    symbol: 'AU$',
    name: 'Australian Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'AUD',
    name_plural: 'Australian dollars'
  },
  AZN: {
    symbol: 'man.',
    name: 'Azerbaijani Manat',
    symbol_native: 'ман.',
    decimal_digits: 2,
    rounding: 0,
    code: 'AZN',
    name_plural: 'Azerbaijani manats'
  },
  BAM: {
    symbol: 'KM',
    name: 'Bosnia-Herzegovina Convertible Mark',
    symbol_native: 'KM',
    decimal_digits: 2,
    rounding: 0,
    code: 'BAM',
    name_plural: 'Bosnia-Herzegovina convertible marks'
  },
  BDT: {
    symbol: 'Tk',
    name: 'Bangladeshi Taka',
    symbol_native: '৳',
    decimal_digits: 2,
    rounding: 0,
    code: 'BDT',
    name_plural: 'Bangladeshi takas'
  },
  BGN: {
    symbol: 'BGN',
    name: 'Bulgarian Lev',
    symbol_native: 'лв.',
    decimal_digits: 2,
    rounding: 0,
    code: 'BGN',
    name_plural: 'Bulgarian leva'
  },
  BHD: {
    symbol: 'BD',
    name: 'Bahraini Dinar',
    symbol_native: 'د.ب.‏',
    decimal_digits: 3,
    rounding: 0,
    code: 'BHD',
    name_plural: 'Bahraini dinars'
  },
  BIF: {
    symbol: 'FBu',
    name: 'Burundian Franc',
    symbol_native: 'FBu',
    decimal_digits: 0,
    rounding: 0,
    code: 'BIF',
    name_plural: 'Burundian francs'
  },
  BND: {
    symbol: 'BN$',
    name: 'Brunei Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'BND',
    name_plural: 'Brunei dollars'
  },
  BOB: {
    symbol: 'Bs',
    name: 'Bolivian Boliviano',
    symbol_native: 'Bs',
    decimal_digits: 2,
    rounding: 0,
    code: 'BOB',
    name_plural: 'Bolivian bolivianos'
  },
  BRL: {
    symbol: 'R$',
    name: 'Brazilian Real',
    symbol_native: 'R$',
    decimal_digits: 2,
    rounding: 0,
    code: 'BRL',
    name_plural: 'Brazilian reals'
  },
  BWP: {
    symbol: 'BWP',
    name: 'Botswanan Pula',
    symbol_native: 'P',
    decimal_digits: 2,
    rounding: 0,
    code: 'BWP',
    name_plural: 'Botswanan pulas'
  },
  BYN: {
    symbol: 'Br',
    name: 'Belarusian Ruble',
    symbol_native: 'руб.',
    decimal_digits: 2,
    rounding: 0,
    code: 'BYN',
    name_plural: 'Belarusian rubles'
  },
  BZD: {
    symbol: 'BZ$',
    name: 'Belize Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'BZD',
    name_plural: 'Belize dollars'
  },
  CDF: {
    symbol: 'CDF',
    name: 'Congolese Franc',
    symbol_native: 'FrCD',
    decimal_digits: 2,
    rounding: 0,
    code: 'CDF',
    name_plural: 'Congolese francs'
  },
  CHF: {
    symbol: 'CHF',
    name: 'Swiss Franc',
    symbol_native: 'CHF',
    decimal_digits: 2,
    rounding: 0.05,
    code: 'CHF',
    name_plural: 'Swiss francs'
  },
  CLP: {
    symbol: 'CL$',
    name: 'Chilean Peso',
    symbol_native: '$',
    decimal_digits: 0,
    rounding: 0,
    code: 'CLP',
    name_plural: 'Chilean pesos'
  },
  CNY: {
    symbol: 'CN¥',
    name: 'Chinese Yuan',
    symbol_native: 'CN¥',
    decimal_digits: 2,
    rounding: 0,
    code: 'CNY',
    name_plural: 'Chinese yuan'
  },
  COP: {
    symbol: 'CO$',
    name: 'Colombian Peso',
    symbol_native: '$',
    decimal_digits: 0,
    rounding: 0,
    code: 'COP',
    name_plural: 'Colombian pesos'
  },
  CRC: {
    symbol: '₡',
    name: 'Costa Rican Colón',
    symbol_native: '₡',
    decimal_digits: 0,
    rounding: 0,
    code: 'CRC',
    name_plural: 'Costa Rican colóns'
  },
  CVE: {
    symbol: 'CV$',
    name: 'Cape Verdean Escudo',
    symbol_native: 'CV$',
    decimal_digits: 2,
    rounding: 0,
    code: 'CVE',
    name_plural: 'Cape Verdean escudos'
  },
  CZK: {
    symbol: 'Kč',
    name: 'Czech Republic Koruna',
    symbol_native: 'Kč',
    decimal_digits: 2,
    rounding: 0,
    code: 'CZK',
    name_plural: 'Czech Republic korunas'
  },
  DJF: {
    symbol: 'Fdj',
    name: 'Djiboutian Franc',
    symbol_native: 'Fdj',
    decimal_digits: 0,
    rounding: 0,
    code: 'DJF',
    name_plural: 'Djiboutian francs'
  },
  DKK: {
    symbol: 'Dkr',
    name: 'Danish Krone',
    symbol_native: 'kr',
    decimal_digits: 2,
    rounding: 0,
    code: 'DKK',
    name_plural: 'Danish kroner'
  },
  DOP: {
    symbol: 'RD$',
    name: 'Dominican Peso',
    symbol_native: 'RD$',
    decimal_digits: 2,
    rounding: 0,
    code: 'DOP',
    name_plural: 'Dominican pesos'
  },
  DZD: {
    symbol: 'DA',
    name: 'Algerian Dinar',
    symbol_native: 'د.ج.‏',
    decimal_digits: 2,
    rounding: 0,
    code: 'DZD',
    name_plural: 'Algerian dinars'
  },
  EEK: {
    symbol: 'Ekr',
    name: 'Estonian Kroon',
    symbol_native: 'kr',
    decimal_digits: 2,
    rounding: 0,
    code: 'EEK',
    name_plural: 'Estonian kroons'
  },
  EGP: {
    symbol: 'EGP',
    name: 'Egyptian Pound',
    symbol_native: 'ج.م.‏',
    decimal_digits: 2,
    rounding: 0,
    code: 'EGP',
    name_plural: 'Egyptian pounds'
  },
  ERN: {
    symbol: 'Nfk',
    name: 'Eritrean Nakfa',
    symbol_native: 'Nfk',
    decimal_digits: 2,
    rounding: 0,
    code: 'ERN',
    name_plural: 'Eritrean nakfas'
  },
  ETB: {
    symbol: 'Br',
    name: 'Ethiopian Birr',
    symbol_native: 'Br',
    decimal_digits: 2,
    rounding: 0,
    code: 'ETB',
    name_plural: 'Ethiopian birrs'
  },
  GBP: {
    symbol: '£',
    name: 'British Pound Sterling',
    symbol_native: '£',
    decimal_digits: 2,
    rounding: 0,
    code: 'GBP',
    name_plural: 'British pounds sterling'
  },
  GEL: {
    symbol: 'GEL',
    name: 'Georgian Lari',
    symbol_native: 'GEL',
    decimal_digits: 2,
    rounding: 0,
    code: 'GEL',
    name_plural: 'Georgian laris'
  },
  GHS: {
    symbol: 'GH₵',
    name: 'Ghanaian Cedi',
    symbol_native: 'GH₵',
    decimal_digits: 2,
    rounding: 0,
    code: 'GHS',
    name_plural: 'Ghanaian cedis'
  },
  GNF: {
    symbol: 'FG',
    name: 'Guinean Franc',
    symbol_native: 'FG',
    decimal_digits: 0,
    rounding: 0,
    code: 'GNF',
    name_plural: 'Guinean francs'
  },
  GTQ: {
    symbol: 'GTQ',
    name: 'Guatemalan Quetzal',
    symbol_native: 'Q',
    decimal_digits: 2,
    rounding: 0,
    code: 'GTQ',
    name_plural: 'Guatemalan quetzals'
  },
  HKD: {
    symbol: 'HK$',
    name: 'Hong Kong Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'HKD',
    name_plural: 'Hong Kong dollars'
  },
  HNL: {
    symbol: 'HNL',
    name: 'Honduran Lempira',
    symbol_native: 'L',
    decimal_digits: 2,
    rounding: 0,
    code: 'HNL',
    name_plural: 'Honduran lempiras'
  },
  HRK: {
    symbol: 'kn',
    name: 'Croatian Kuna',
    symbol_native: 'kn',
    decimal_digits: 2,
    rounding: 0,
    code: 'HRK',
    name_plural: 'Croatian kunas'
  },
  HUF: {
    symbol: 'Ft',
    name: 'Hungarian Forint',
    symbol_native: 'Ft',
    decimal_digits: 0,
    rounding: 0,
    code: 'HUF',
    name_plural: 'Hungarian forints'
  },
  IDR: {
    symbol: 'Rp',
    name: 'Indonesian Rupiah',
    symbol_native: 'Rp',
    decimal_digits: 0,
    rounding: 0,
    code: 'IDR',
    name_plural: 'Indonesian rupiahs'
  },
  ILS: {
    symbol: '₪',
    name: 'Israeli New Sheqel',
    symbol_native: '₪',
    decimal_digits: 2,
    rounding: 0,
    code: 'ILS',
    name_plural: 'Israeli new sheqels'
  },
  INR: {
    symbol: 'Rs',
    name: 'Indian Rupee',
    symbol_native: 'টকা',
    decimal_digits: 2,
    rounding: 0,
    code: 'INR',
    name_plural: 'Indian rupees'
  },
  IQD: {
    symbol: 'IQD',
    name: 'Iraqi Dinar',
    symbol_native: 'د.ع.‏',
    decimal_digits: 0,
    rounding: 0,
    code: 'IQD',
    name_plural: 'Iraqi dinars'
  },
  IRR: {
    symbol: 'IRR',
    name: 'Iranian Rial',
    symbol_native: '﷼',
    decimal_digits: 0,
    rounding: 0,
    code: 'IRR',
    name_plural: 'Iranian rials'
  },
  ISK: {
    symbol: 'Ikr',
    name: 'Icelandic Króna',
    symbol_native: 'kr',
    decimal_digits: 0,
    rounding: 0,
    code: 'ISK',
    name_plural: 'Icelandic krónur'
  },
  JMD: {
    symbol: 'J$',
    name: 'Jamaican Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'JMD',
    name_plural: 'Jamaican dollars'
  },
  JOD: {
    symbol: 'JD',
    name: 'Jordanian Dinar',
    symbol_native: 'د.أ.‏',
    decimal_digits: 3,
    rounding: 0,
    code: 'JOD',
    name_plural: 'Jordanian dinars'
  },
  JPY: {
    symbol: '¥',
    name: 'Japanese Yen',
    symbol_native: '￥',
    decimal_digits: 0,
    rounding: 0,
    code: 'JPY',
    name_plural: 'Japanese yen'
  },
  KES: {
    symbol: 'Ksh',
    name: 'Kenyan Shilling',
    symbol_native: 'Ksh',
    decimal_digits: 2,
    rounding: 0,
    code: 'KES',
    name_plural: 'Kenyan shillings'
  },
  KHR: {
    symbol: 'KHR',
    name: 'Cambodian Riel',
    symbol_native: '៛',
    decimal_digits: 2,
    rounding: 0,
    code: 'KHR',
    name_plural: 'Cambodian riels'
  },
  KMF: {
    symbol: 'CF',
    name: 'Comorian Franc',
    symbol_native: 'FC',
    decimal_digits: 0,
    rounding: 0,
    code: 'KMF',
    name_plural: 'Comorian francs'
  },
  KRW: {
    symbol: '₩',
    name: 'South Korean Won',
    symbol_native: '₩',
    decimal_digits: 0,
    rounding: 0,
    code: 'KRW',
    name_plural: 'South Korean won'
  },
  KWD: {
    symbol: 'KD',
    name: 'Kuwaiti Dinar',
    symbol_native: 'د.ك.‏',
    decimal_digits: 3,
    rounding: 0,
    code: 'KWD',
    name_plural: 'Kuwaiti dinars'
  },
  KZT: {
    symbol: 'KZT',
    name: 'Kazakhstani Tenge',
    symbol_native: 'тңг.',
    decimal_digits: 2,
    rounding: 0,
    code: 'KZT',
    name_plural: 'Kazakhstani tenges'
  },
  LBP: {
    symbol: 'L.L.',
    name: 'Lebanese Pound',
    symbol_native: 'ل.ل.‏',
    decimal_digits: 0,
    rounding: 0,
    code: 'LBP',
    name_plural: 'Lebanese pounds'
  },
  LKR: {
    symbol: 'SLRs',
    name: 'Sri Lankan Rupee',
    symbol_native: 'SL Re',
    decimal_digits: 2,
    rounding: 0,
    code: 'LKR',
    name_plural: 'Sri Lankan rupees'
  },
  LTL: {
    symbol: 'Lt',
    name: 'Lithuanian Litas',
    symbol_native: 'Lt',
    decimal_digits: 2,
    rounding: 0,
    code: 'LTL',
    name_plural: 'Lithuanian litai'
  },
  LVL: {
    symbol: 'Ls',
    name: 'Latvian Lats',
    symbol_native: 'Ls',
    decimal_digits: 2,
    rounding: 0,
    code: 'LVL',
    name_plural: 'Latvian lati'
  },
  LYD: {
    symbol: 'LD',
    name: 'Libyan Dinar',
    symbol_native: 'د.ل.‏',
    decimal_digits: 3,
    rounding: 0,
    code: 'LYD',
    name_plural: 'Libyan dinars'
  },
  MAD: {
    symbol: 'MAD',
    name: 'Moroccan Dirham',
    symbol_native: 'د.م.‏',
    decimal_digits: 2,
    rounding: 0,
    code: 'MAD',
    name_plural: 'Moroccan dirhams'
  },
  MDL: {
    symbol: 'MDL',
    name: 'Moldovan Leu',
    symbol_native: 'MDL',
    decimal_digits: 2,
    rounding: 0,
    code: 'MDL',
    name_plural: 'Moldovan lei'
  },
  MGA: {
    symbol: 'MGA',
    name: 'Malagasy Ariary',
    symbol_native: 'MGA',
    decimal_digits: 0,
    rounding: 0,
    code: 'MGA',
    name_plural: 'Malagasy Ariaries'
  },
  MKD: {
    symbol: 'MKD',
    name: 'Macedonian Denar',
    symbol_native: 'MKD',
    decimal_digits: 2,
    rounding: 0,
    code: 'MKD',
    name_plural: 'Macedonian denari'
  },
  MMK: {
    symbol: 'MMK',
    name: 'Myanma Kyat',
    symbol_native: 'K',
    decimal_digits: 0,
    rounding: 0,
    code: 'MMK',
    name_plural: 'Myanma kyats'
  },
  MOP: {
    symbol: 'MOP$',
    name: 'Macanese Pataca',
    symbol_native: 'MOP$',
    decimal_digits: 2,
    rounding: 0,
    code: 'MOP',
    name_plural: 'Macanese patacas'
  },
  MUR: {
    symbol: 'MURs',
    name: 'Mauritian Rupee',
    symbol_native: 'MURs',
    decimal_digits: 0,
    rounding: 0,
    code: 'MUR',
    name_plural: 'Mauritian rupees'
  },
  MXN: {
    symbol: 'MX$',
    name: 'Mexican Peso',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'MXN',
    name_plural: 'Mexican pesos'
  },
  MYR: {
    symbol: 'RM',
    name: 'Malaysian Ringgit',
    symbol_native: 'RM',
    decimal_digits: 2,
    rounding: 0,
    code: 'MYR',
    name_plural: 'Malaysian ringgits'
  },
  MZN: {
    symbol: 'MTn',
    name: 'Mozambican Metical',
    symbol_native: 'MTn',
    decimal_digits: 2,
    rounding: 0,
    code: 'MZN',
    name_plural: 'Mozambican meticals'
  },
  NAD: {
    symbol: 'N$',
    name: 'Namibian Dollar',
    symbol_native: 'N$',
    decimal_digits: 2,
    rounding: 0,
    code: 'NAD',
    name_plural: 'Namibian dollars'
  },
  NGN: {
    symbol: '₦',
    name: 'Nigerian Naira',
    symbol_native: '₦',
    decimal_digits: 2,
    rounding: 0,
    code: 'NGN',
    name_plural: 'Nigerian nairas'
  },
  NIO: {
    symbol: 'C$',
    name: 'Nicaraguan Córdoba',
    symbol_native: 'C$',
    decimal_digits: 2,
    rounding: 0,
    code: 'NIO',
    name_plural: 'Nicaraguan córdobas'
  },
  NOK: {
    symbol: 'Nkr',
    name: 'Norwegian Krone',
    symbol_native: 'kr',
    decimal_digits: 2,
    rounding: 0,
    code: 'NOK',
    name_plural: 'Norwegian kroner'
  },
  NPR: {
    symbol: 'NPRs',
    name: 'Nepalese Rupee',
    symbol_native: 'नेरू',
    decimal_digits: 2,
    rounding: 0,
    code: 'NPR',
    name_plural: 'Nepalese rupees'
  },
  NZD: {
    symbol: 'NZ$',
    name: 'New Zealand Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'NZD',
    name_plural: 'New Zealand dollars'
  },
  OMR: {
    symbol: 'OMR',
    name: 'Omani Rial',
    symbol_native: 'ر.ع.‏',
    decimal_digits: 3,
    rounding: 0,
    code: 'OMR',
    name_plural: 'Omani rials'
  },
  PAB: {
    symbol: 'B/.',
    name: 'Panamanian Balboa',
    symbol_native: 'B/.',
    decimal_digits: 2,
    rounding: 0,
    code: 'PAB',
    name_plural: 'Panamanian balboas'
  },
  PEN: {
    symbol: 'S/.',
    name: 'Peruvian Nuevo Sol',
    symbol_native: 'S/.',
    decimal_digits: 2,
    rounding: 0,
    code: 'PEN',
    name_plural: 'Peruvian nuevos soles'
  },
  PHP: {
    symbol: '₱',
    name: 'Philippine Peso',
    symbol_native: '₱',
    decimal_digits: 2,
    rounding: 0,
    code: 'PHP',
    name_plural: 'Philippine pesos'
  },
  PKR: {
    symbol: 'PKRs',
    name: 'Pakistani Rupee',
    symbol_native: '₨',
    decimal_digits: 0,
    rounding: 0,
    code: 'PKR',
    name_plural: 'Pakistani rupees'
  },
  PLN: {
    symbol: 'zł',
    name: 'Polish Zloty',
    symbol_native: 'zł',
    decimal_digits: 2,
    rounding: 0,
    code: 'PLN',
    name_plural: 'Polish zlotys'
  },
  PYG: {
    symbol: '₲',
    name: 'Paraguayan Guarani',
    symbol_native: '₲',
    decimal_digits: 0,
    rounding: 0,
    code: 'PYG',
    name_plural: 'Paraguayan guaranis'
  },
  QAR: {
    symbol: 'QR',
    name: 'Qatari Rial',
    symbol_native: 'ر.ق.‏',
    decimal_digits: 2,
    rounding: 0,
    code: 'QAR',
    name_plural: 'Qatari rials'
  },
  RON: {
    symbol: 'RON',
    name: 'Romanian Leu',
    symbol_native: 'RON',
    decimal_digits: 2,
    rounding: 0,
    code: 'RON',
    name_plural: 'Romanian lei'
  },
  RSD: {
    symbol: 'din.',
    name: 'Serbian Dinar',
    symbol_native: 'дин.',
    decimal_digits: 0,
    rounding: 0,
    code: 'RSD',
    name_plural: 'Serbian dinars'
  },
  RUB: {
    symbol: 'RUB',
    name: 'Russian Ruble',
    symbol_native: '₽.',
    decimal_digits: 2,
    rounding: 0,
    code: 'RUB',
    name_plural: 'Russian rubles'
  },
  RWF: {
    symbol: 'RWF',
    name: 'Rwandan Franc',
    symbol_native: 'FR',
    decimal_digits: 0,
    rounding: 0,
    code: 'RWF',
    name_plural: 'Rwandan francs'
  },
  SAR: {
    symbol: 'SR',
    name: 'Saudi Riyal',
    symbol_native: 'ر.س.‏',
    decimal_digits: 2,
    rounding: 0,
    code: 'SAR',
    name_plural: 'Saudi riyals'
  },
  SDG: {
    symbol: 'SDG',
    name: 'Sudanese Pound',
    symbol_native: 'SDG',
    decimal_digits: 2,
    rounding: 0,
    code: 'SDG',
    name_plural: 'Sudanese pounds'
  },
  SEK: {
    symbol: 'Skr',
    name: 'Swedish Krona',
    symbol_native: 'kr',
    decimal_digits: 2,
    rounding: 0,
    code: 'SEK',
    name_plural: 'Swedish kronor'
  },
  SGD: {
    symbol: 'S$',
    name: 'Singapore Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'SGD',
    name_plural: 'Singapore dollars'
  },
  SOS: {
    symbol: 'Ssh',
    name: 'Somali Shilling',
    symbol_native: 'Ssh',
    decimal_digits: 0,
    rounding: 0,
    code: 'SOS',
    name_plural: 'Somali shillings'
  },
  SYP: {
    symbol: 'SY£',
    name: 'Syrian Pound',
    symbol_native: 'ل.س.‏',
    decimal_digits: 0,
    rounding: 0,
    code: 'SYP',
    name_plural: 'Syrian pounds'
  },
  THB: {
    symbol: '฿',
    name: 'Thai Baht',
    symbol_native: '฿',
    decimal_digits: 2,
    rounding: 0,
    code: 'THB',
    name_plural: 'Thai baht'
  },
  TND: {
    symbol: 'DT',
    name: 'Tunisian Dinar',
    symbol_native: 'د.ت.‏',
    decimal_digits: 3,
    rounding: 0,
    code: 'TND',
    name_plural: 'Tunisian dinars'
  },
  TOP: {
    symbol: 'T$',
    name: 'Tongan Paʻanga',
    symbol_native: 'T$',
    decimal_digits: 2,
    rounding: 0,
    code: 'TOP',
    name_plural: 'Tongan paʻanga'
  },
  TRY: {
    symbol: 'TL',
    name: 'Turkish Lira',
    symbol_native: 'TL',
    decimal_digits: 2,
    rounding: 0,
    code: 'TRY',
    name_plural: 'Turkish Lira'
  },
  TTD: {
    symbol: 'TT$',
    name: 'Trinidad and Tobago Dollar',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'TTD',
    name_plural: 'Trinidad and Tobago dollars'
  },
  TWD: {
    symbol: 'NT$',
    name: 'New Taiwan Dollar',
    symbol_native: 'NT$',
    decimal_digits: 2,
    rounding: 0,
    code: 'TWD',
    name_plural: 'New Taiwan dollars'
  },
  TZS: {
    symbol: 'TSh',
    name: 'Tanzanian Shilling',
    symbol_native: 'TSh',
    decimal_digits: 0,
    rounding: 0,
    code: 'TZS',
    name_plural: 'Tanzanian shillings'
  },
  UAH: {
    symbol: '₴',
    name: 'Ukrainian Hryvnia',
    symbol_native: '₴',
    decimal_digits: 2,
    rounding: 0,
    code: 'UAH',
    name_plural: 'Ukrainian hryvnias'
  },
  UGX: {
    symbol: 'USh',
    name: 'Ugandan Shilling',
    symbol_native: 'USh',
    decimal_digits: 0,
    rounding: 0,
    code: 'UGX',
    name_plural: 'Ugandan shillings'
  },
  UYU: {
    symbol: '$U',
    name: 'Uruguayan Peso',
    symbol_native: '$',
    decimal_digits: 2,
    rounding: 0,
    code: 'UYU',
    name_plural: 'Uruguayan pesos'
  },
  UZS: {
    symbol: 'UZS',
    name: 'Uzbekistan Som',
    symbol_native: 'UZS',
    decimal_digits: 0,
    rounding: 0,
    code: 'UZS',
    name_plural: 'Uzbekistan som'
  },
  VEF: {
    symbol: 'Bs.F.',
    name: 'Venezuelan Bolívar',
    symbol_native: 'Bs.F.',
    decimal_digits: 2,
    rounding: 0,
    code: 'VEF',
    name_plural: 'Venezuelan bolívars'
  },
  VND: {
    symbol: '₫',
    name: 'Vietnamese Dong',
    symbol_native: '₫',
    decimal_digits: 0,
    rounding: 0,
    code: 'VND',
    name_plural: 'Vietnamese dong'
  },
  XAF: {
    symbol: 'FCFA',
    name: 'CFA Franc BEAC',
    symbol_native: 'FCFA',
    decimal_digits: 0,
    rounding: 0,
    code: 'XAF',
    name_plural: 'CFA francs BEAC'
  },
  XOF: {
    symbol: 'CFA',
    name: 'CFA Franc BCEAO',
    symbol_native: 'CFA',
    decimal_digits: 0,
    rounding: 0,
    code: 'XOF',
    name_plural: 'CFA francs BCEAO'
  },
  YER: {
    symbol: 'YR',
    name: 'Yemeni Rial',
    symbol_native: 'ر.ي.‏',
    decimal_digits: 0,
    rounding: 0,
    code: 'YER',
    name_plural: 'Yemeni rials'
  },
  ZAR: {
    symbol: 'R',
    name: 'South African Rand',
    symbol_native: 'R',
    decimal_digits: 2,
    rounding: 0,
    code: 'ZAR',
    name_plural: 'South African rand'
  },
  ZMK: {
    symbol: 'ZK',
    name: 'Zambian Kwacha',
    symbol_native: 'ZK',
    decimal_digits: 0,
    rounding: 0,
    code: 'ZMK',
    name_plural: 'Zambian kwachas'
  },
  ZWL: {
    symbol: 'ZWL$',
    name: 'Zimbabwean Dollar',
    symbol_native: 'ZWL$',
    decimal_digits: 0,
    rounding: 0,
    code: 'ZWL',
    name_plural: 'Zimbabwean Dollar'
  }
};

const getCurrency = (code = 'USD') => {
  return currenciesData[code];
};
function formatPrice(price) {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return numPrice.toFixed(2);
}
const getPriceWithCurrency = (price, code = 'USD') => {
  const currency = getCurrency(code);
  return `${currency?.symbol ?? code}${formatPrice(price)}`;
};

const isNullable = value => {
  return value === null || value === undefined;
};

const Product = ({
  imgUrl,
  imgAlt,
  currencyCode = 'USD',
  title = '',
  type = 'cart',
  price = 0,
  isHigher
}) => {
  return /*#__PURE__*/jsx("div", {
    className: cn('relative', {
      'border-transparent p-[1px] before:absolute before:z-[1] before:rounded-[17px] before:bg-gradient-primary before:top-0 before:left-0 before:w-full before:h-full': isHigher,
      'border border-border rounded-2xl': !isHigher
    }),
    children: /*#__PURE__*/jsxs("div", {
      className: "relative z-[2] p-4 rounded-2xl bg-background-primary text-foreground-primary flex items-center gap-3 w-full justify-between",
      children: [/*#__PURE__*/jsxs("div", {
        className: cn('flex w-full items-center', {
          'gap-3': type === 'cart',
          'gap-2': type === 'bidding'
        }),
        children: [/*#__PURE__*/jsx("img", {
          className: "h-[60px] w-[60px] object-contain",
          src: imgUrl ?? 'https://placeholder.pics/images/icons/apple-icon-60x60.png',
          alt: imgAlt ?? 'Auction Item'
        }), /*#__PURE__*/jsxs("div", {
          className: "flex flex-col flex-grow gap-1.5",
          children: [/*#__PURE__*/jsx(Title, {
            tag: 'h3',
            size: 'sm',
            children: title
          }), /*#__PURE__*/jsx(Title, {
            tag: 'h4',
            children: !isNullable(price) && getPriceWithCurrency(price, currencyCode)
          })]
        })]
      }), type === 'cart' && /*#__PURE__*/jsx(Button, {
        variant: 'icon',
        children: /*#__PURE__*/jsx(SvgBucket, {
          width: "24",
          height: "24"
        })
      })]
    })
  });
};
Product.displayName = 'Product';

const ListProducts = ({
  list
}) => {
  return /*#__PURE__*/jsx("div", {
    className: "flex flex-col gap-2",
    children: list.map(({
      userName,
      userLocation,
      ...product
    }, index) => /*#__PURE__*/jsx(Product, {
      title: /*#__PURE__*/jsxs(Fragment, {
        children: [userName && /*#__PURE__*/jsx(Paragraph, {
          size: 'xs',
          tag: 'span',
          children: userName
        }), userLocation && /*#__PURE__*/jsxs(Paragraph, {
          size: 'xs',
          variant: 'gray',
          tag: 'span',
          children: [' ', "\xB7 ", userLocation]
        })]
      }),
      type: 'bidding',
      ...product
    }, product.imgUrl + index))
  });
};
ListProducts.displayName = 'ListProducts';

const BiddingPreparation = () => {
  const {
    auctionState
  } = useContext(WidgetContext);
  const {
    t
  } = useI18n();
  const list = useMemo(() => {
    const {
      members
    } = auctionState.waitRoundMessage?.data ?? {};
    if (!members || !members.length) {
      return [];
    }
    return members.map(member => ({
      imgUrl: member?.products[0]?.imageUrl,
      imgAlt: member?.products[0]?.name,
      price: null,
      currencyCode: member.currency,
      userName: member.name,
      userLocation: member.location
    }));
  }, [auctionState]);
  return /*#__PURE__*/jsxs("div", {
    className: "widget-screen",
    children: [/*#__PURE__*/jsxs("div", {
      className: "widget-screen-content",
      children: [/*#__PURE__*/jsx(Title, {
        children: t('bidding-preparation.title')
      }), /*#__PURE__*/jsxs("div", {
        children: [/*#__PURE__*/jsx(Title, {
          size: 'md',
          tag: 'h3',
          children: t('bidding-preparation.subtitle')
        }), /*#__PURE__*/jsx(Paragraph, {
          size: 'xs',
          variant: 'gray',
          children: t('bidding-preparation.description')
        })]
      }), /*#__PURE__*/jsx(ProgressLine, {
        duration: 30
      }), /*#__PURE__*/jsx(ListProducts, {
        list: list
      })]
    }), /*#__PURE__*/jsx(Logo, {})]
  });
};
BiddingPreparation.displayName = 'BiddingPreparation';

const holdCircleColors = {
  primary: 'stroke-background-primary',
  secondary: 'stroke-background-secondary'
};
const ProgressCircle = ({
  initialProgress = 100,
  // seconds
  delay = 3,
  classNameWrapper,
  holdCircleColor = 'primary',
  width = 129,
  isReverse = false,
  resetTrigger
}) => {
  const svgRef = useRef(null);
  useEffect(() => {
    if (!svgRef.current) {
      return;
    }
    svgRef.current.style.animation = 'none';
    setTimeout(() => {
      if (!svgRef.current) {
        return;
      }
      svgRef.current.style.setProperty('animation', `progress-animation-circle ${delay}s linear 0s 1 forwards ${isReverse ? 'reverse' : ''}`);
    }, 10);
  }, [resetTrigger, delay, isReverse]);
  return /*#__PURE__*/jsxs("div", {
    className: cn('relative w-fit h-fit', classNameWrapper),
    children: [/*#__PURE__*/jsx("div", {
      style: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      },
      children: /*#__PURE__*/jsx(SvgHourglass2, {
        width: 33,
        height: 33,
        className: 'text-foreground-primary'
      })
    }), /*#__PURE__*/jsxs("svg", {
      ref: svgRef,
      width: width,
      height: width,
      viewBox: `0 0 ${width} ${width}`,
      className: "circular-progress",
      style: {
        '--progress': initialProgress,
        animation: `progress-animation-circle ${delay}s linear 0s 1 forwards ${isReverse ? 'reverse' : ''}`,
        '--size': `${width}px`
      },
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      children: [/*#__PURE__*/jsx("circle", {
        className: cn('circular-progress-bg', holdCircleColors[holdCircleColor])
      }), /*#__PURE__*/jsx("circle", {
        className: cn('circular-progress-fg')
      })]
    })]
  });
};
ProgressCircle.displayName = 'ProgressCircle';

const AuctionPrice = ({
  price,
  currencyCode,
  vector = 'up',
  borderColor = 'gray',
  description,
  title,
  onClick,
  disabled = false
}) => {
  const {
    t
  } = useI18n();
  return /*#__PURE__*/jsx("div", {
    className: cn('rounded-2xl border relative p-[1px]', {
      'border-border': borderColor === 'gray',
      'border-transparent before:block before:w-full before:h-full before:rounded-2xl before:bg-gradient-primary before:absolute before:top-0 before:left-0 before:z-[1]': borderColor === 'gradient'
    }),
    children: /*#__PURE__*/jsxs("div", {
      className: 'relative w-full h-full p-4 bg-background-primary z-[2] rounded-2xl',
      children: [/*#__PURE__*/jsx(Title, {
        className: 'mb-2',
        size: 'sm',
        tag: 'p',
        children: title
      }), /*#__PURE__*/jsxs("div", {
        className: 'flex gap-2 items-center mb-1',
        children: [/*#__PURE__*/jsx(Paragraph, {
          className: '!text-2.5xl leading-8.5 font-semibold',
          variant: 'gradient',
          children: !isNullable(price) && getPriceWithCurrency(price, currencyCode)
        }), /*#__PURE__*/jsx("div", {
          className: 'flex items-center justify-center w-5 h-5 rounded-full bg-accent/25',
          children: /*#__PURE__*/jsx(SvgDownArrow, {
            width: 12,
            height: 12,
            className: cn('text-accent', {
              'rotate-180': vector === 'up'
            })
          })
        })]
      }), /*#__PURE__*/jsx(Paragraph, {
        className: 'text-sm leading-4 mb-4',
        variant: 'gray',
        children: description
      }), /*#__PURE__*/jsx(Button, {
        className: 'w-full',
        onClick: onClick,
        disabled: disabled,
        children: t('buttons.catch-price')
      })]
    })
  });
};
AuctionPrice.displayName = 'AuctionPrice';

const useScreenCredentials = () => {
  const [screen, setScreen] = useState({
    width: 0,
    height: 0
  });
  useEffect(() => {
    const handleWindowResize = () => {
      setScreen({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);
  return {
    screen,
    isMobile: screen.width <= 640
  };
};

const linesClasses = {
  1: '[-webkit-line-clamp:1]',
  3: '[-webkit-line-clamp:3]',
  5: '[-webkit-line-clamp:5]',
  10: '[-webkit-line-clamp:10]',
  15: '[-webkit-line-clamp:15]'
};
const ClampText = ({
  children,
  lines = 5,
  hasToggleButton = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const paragraphRef = useRef(null);
  const {
    t
  } = useI18n();
  const handleToggle = () => {
    setIsOpen(prev => !prev);
  };
  useEffect(() => {
    const handleResize = () => {
      const paragraph = paragraphRef.current;
      if (!paragraph || !hasToggleButton) {
        return;
      }
      if (isOpen) {
        setIsOverflowing(true);
        return;
      }
      setIsOverflowing(paragraph.scrollHeight > paragraph.clientHeight);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [children, isOpen, hasToggleButton]);
  return /*#__PURE__*/jsxs("div", {
    className: 'flex flex-col gap-2',
    children: [/*#__PURE__*/jsx("div", {
      className: cn(!isOpen && linesClasses[lines], !isOpen && `[display:-webkit-box] [-webkit-box-orient:vertical] [overflow:hidden]`),
      children: /*#__PURE__*/jsx("div", {
        ref: paragraphRef,
        children: /*#__PURE__*/jsx(Paragraph, {
          className: 'text-sm leading-5',
          variant: 'gray',
          children: children
        })
      })
    }), hasToggleButton && isOverflowing && /*#__PURE__*/jsx("button", {
      className: 'flex gap-1.5 items-center justify-center w-fit h-fit p-0 no-underline font-normal text-accent text-sm leading-4',
      type: 'button',
      onClick: handleToggle,
      children: /*#__PURE__*/jsx("span", {
        children: t(isOpen ? 'buttons.hide' : 'buttons.show-more')
      })
    })]
  });
};

const AuctionBiddingFirstRound = () => {
  const {
    auctionState,
    handleAuctionSendMessage
  } = useContext(WidgetContext);
  const [isSoundOff, setIsSoundOff] = useState(false);
  const {
    isMobile
  } = useScreenCredentials();
  const [isPriceCatch, setIsPriceCatch] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(Date.now());
  const {
    t
  } = useI18n();
  useEffect(() => {
    setResetTrigger(Date.now());
  }, [auctionState.roundStepMessage]);
  useEffect(() => {
    if (auctionState.errorEvent === WS_EVENT_ENUM.BET) {
      setIsPriceCatch(false);
    }
  }, [auctionState.errorEvent]);
  const {
    productList,
    customerProducts
  } = useMemo(() => {
    const {
      products: customerProducts = []
    } = auctionState.selectionMessage?.data ?? {};
    const currentCustomer = auctionState.currentCustomer;
    const {
      members = []
    } = auctionState.waitRoundMessage?.data ?? {};
    const {
      others = {},
      price
    } = auctionState.roundStepMessage?.data ?? {};
    const customerProduct = customerProducts[0];
    const filteredMembers = members.filter(member => member.sessionId !== auctionState?.selectionMessage?.data.sessionId);
    const response = Object.entries(others).map(([id, price]) => {
      const member = filteredMembers.find(m => m.sessionId === id);
      if (!member) {
        return;
      }
      return {
        imgUrl: member?.products[0]?.imageUrl,
        imgAlt: member?.products[0]?.name,
        price: price,
        currencyCode: member.currency,
        userName: member.name,
        userLocation: member.location
      };
    });
    return {
      productList: response.filter(item => Boolean(item)),
      customerProducts: [{
        imgUrl: customerProduct?.imageUrl,
        imgAlt: customerProduct?.name,
        price: price,
        currencyCode: currentCustomer?.currency,
        userName: currentCustomer?.name,
        userLocation: currentCustomer?.location
      }]
    };
  }, [auctionState]);
  const handleCatchPrice = () => {
    const hasError = handleAuctionSendMessage({
      command: WS_EVENT_ENUM.BET,
      auctionId: auctionState.waitRoundMessage?.data.auctionId,
      round: 1,
      sessionId: auctionState.selectionMessage?.data.sessionId
    });
    if (!hasError) {
      setIsPriceCatch(true);
    }
  };
  return /*#__PURE__*/jsxs("div", {
    className: "flex flex-col-reverse sm:flex-row flex-grow bg-background-primary text-foreground-primary",
    children: [/*#__PURE__*/jsxs("div", {
      className: "widget-screen sm:bg-background-secondary sm:text-foreground-secondary pt-6 !pb-4 sm:basis-1/2 sm:w-1/2 sm:max-w-73",
      children: [/*#__PURE__*/jsxs("div", {
        className: "widget-screen-content",
        children: [!isMobile && /*#__PURE__*/jsxs("div", {
          className: 'flex gap-7 mb-2',
          children: [/*#__PURE__*/jsx(Button, {
            className: 'rounded-full p-0',
            style: {
              width: '40px',
              height: '40px'
            },
            variant: 'secondary',
            onClick: () => setIsSoundOff(p => !p),
            children: isSoundOff ? /*#__PURE__*/jsx(SvgSpeakerOff, {
              width: 24,
              height: 24
            }) : /*#__PURE__*/jsx(SvgSpeakerOn, {
              width: 24,
              height: 24
            })
          }), /*#__PURE__*/jsx(ProgressCircle, {
            resetTrigger: resetTrigger,
            classNameWrapper: 'mx-auto',
            holdCircleColor: 'primary',
            delay: auctionState.waitRoundMessage?.data.stepDelay ?? 3,
            initialProgress: 0
          }), /*#__PURE__*/jsx("div", {
            className: 'w-10 h-10 !block'
          })]
        }), /*#__PURE__*/jsxs(Title, {
          className: 'font-normal',
          size: 'md',
          children: [t('first-round.other-bidders'), " (", productList.length, ")"]
        }), /*#__PURE__*/jsx(ListProducts, {
          list: productList
        })]
      }), /*#__PURE__*/jsx(Logo, {})]
    }), /*#__PURE__*/jsx("div", {
      className: "widget-screen pt-6 sm:basis-1/2 sm:w-1/2 max-sm:!flex-grow-0",
      children: /*#__PURE__*/jsxs("div", {
        className: "widget-screen-content max-sm:!flex-grow-0",
        children: [/*#__PURE__*/jsx(Title, {
          children: t('first-round.title')
        }), isMobile && /*#__PURE__*/jsxs("div", {
          className: 'flex gap-7 mb-3',
          children: [/*#__PURE__*/jsx(Button, {
            className: 'rounded-full p-0',
            style: {
              width: '40px',
              height: '40px'
            },
            variant: 'secondary',
            onClick: () => setIsSoundOff(p => !p),
            children: isSoundOff ? /*#__PURE__*/jsx(SvgSpeakerOff, {
              width: 24,
              height: 24
            }) : /*#__PURE__*/jsx(SvgSpeakerOn, {
              width: 24,
              height: 24
            })
          }), /*#__PURE__*/jsx(ProgressCircle, {
            resetTrigger: resetTrigger,
            classNameWrapper: 'mx-auto',
            holdCircleColor: 'secondary',
            delay: auctionState.waitRoundMessage?.data.stepDelay ?? 3,
            initialProgress: 0
          }), /*#__PURE__*/jsx("div", {
            className: 'w-10 h-10 !block'
          })]
        }), /*#__PURE__*/jsxs("div", {
          className: 'flex flex-col gap-2',
          children: [/*#__PURE__*/jsx(AuctionPrice, {
            title: t('first-round.auction-price.title')
            // title={'Starting price'}
            ,
            description: t('first-round.auction-price.description')
            // description={'Become the only one to grab the lowest price!'}
            ,
            price: auctionState.roundStepMessage?.data.price,
            currencyCode: auctionState.selectionMessage?.data.currency,
            disabled: isPriceCatch || auctionState.isFirstRoundWinner,
            onClick: handleCatchPrice,
            vector: 'down'
          }), /*#__PURE__*/jsx("ul", {
            className: 'sm:grid sm:grid-cols-2 flex gap-2 w-full overflow-x-auto max-sm:pb-1',
            children: [...customerProducts, ...productList].map(product => /*#__PURE__*/jsx("li", {
              className: 'flex items-center justify-center w-full h-auto aspect-square border border-border rounded-2xl p-2 sm:p-4 max-sm:min-w-20',
              children: /*#__PURE__*/jsx("img", {
                className: 'w-full h-full object-contain',
                src: product.imgUrl,
                alt: product.imgAlt,
                width: 101,
                height: 101
              })
            }, product.imgUrl + 'img'))
          })]
        }), /*#__PURE__*/jsx(ClampText, {
          lines: 3,
          hasToggleButton: true,
          children: t('first-round.description')
        })]
      })
    })]
  });
};
AuctionBiddingFirstRound.displayName = 'AuctionBiddingFirstRound';

const AuctionBidding = () => {
  const {
    auctionState,
    handleAuctionSendMessage
  } = useContext(WidgetContext);
  const [isSoundOff, setIsSoundOff] = useState(false);
  const {
    isMobile
  } = useScreenCredentials();
  const [isPriceCatch, setIsPriceCatch] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(Date.now());
  const {
    t
  } = useI18n();
  useEffect(() => {
    setResetTrigger(Date.now());
  }, [auctionState.roundStepMessage]);
  useEffect(() => {
    console.log('auctionState?.currentCustomer?.sessionId: ', auctionState?.currentCustomer?.sessionId);
    console.log('auctionState.selfBetMessage?.data.memberId: ', auctionState.selfBetMessage?.data.memberId);
    setIsPriceCatch(auctionState.selfBetMessage?.data.memberId === auctionState?.currentCustomer?.sessionId);
  }, [auctionState.selfBetMessage, auctionState?.currentCustomer]);
  const {
    productList,
    customerProducts
  } = useMemo(() => {
    const {
      products: customerProducts = []
    } = auctionState.selectionMessage?.data ?? {};
    const currentCustomer = auctionState.currentCustomer;
    const {
      members = []
    } = auctionState.waitRoundMessage?.data ?? {};
    const {
      others = {},
      price
    } = auctionState.roundStepMessage?.data ?? {};
    const customerProduct = customerProducts[0];
    const filteredMembers = members.filter(member => member.sessionId !== auctionState?.selectionMessage?.data.sessionId);
    const response = Object.entries(others).map(([id, price]) => {
      const member = filteredMembers.find(m => m.sessionId === id);
      if (!member) {
        return;
      }
      return {
        imgUrl: member?.products[0]?.imageUrl,
        imgAlt: member?.products[0]?.name,
        price: price,
        currencyCode: member.currency,
        userName: member.name,
        userLocation: member.location,
        isHigher: auctionState.selfBetMessage?.data.memberId === member.sessionId
      };
    });
    return {
      productList: response.filter(item => Boolean(item)),
      customerProducts: [{
        imgUrl: customerProduct?.imageUrl,
        imgAlt: customerProduct?.name,
        price: price,
        currencyCode: currentCustomer?.currency,
        userName: currentCustomer?.name,
        userLocation: currentCustomer?.location,
        isHigher: auctionState.selfBetMessage?.data.memberId === currentCustomer?.sessionId
      }]
    };
  }, [auctionState, auctionState.selfBetMessage]);
  const handleCatchPrice = () => {
    const hasError = handleAuctionSendMessage({
      command: WS_EVENT_ENUM.BET,
      auctionId: auctionState.waitRoundMessage?.data.auctionId,
      round: 2,
      sessionId: auctionState.selectionMessage?.data.sessionId
    });
    if (!hasError) {
      setIsPriceCatch(true);
    }
  };
  return /*#__PURE__*/jsxs("div", {
    className: "flex flex-col-reverse sm:flex-row flex-grow bg-background-primary text-foreground-primary",
    children: [/*#__PURE__*/jsxs("div", {
      className: "widget-screen sm:bg-background-secondary sm:text-foreground-secondary pt-6 !pb-4 sm:basis-1/2 sm:w-1/2 sm:max-w-73",
      children: [/*#__PURE__*/jsxs("div", {
        className: "widget-screen-content",
        children: [!isMobile && /*#__PURE__*/jsxs("div", {
          className: 'flex gap-7 mb-2',
          children: [/*#__PURE__*/jsx(Button, {
            className: 'rounded-full p-0',
            style: {
              width: '40px',
              height: '40px'
            },
            variant: 'secondary',
            onClick: () => setIsSoundOff(p => !p),
            children: isSoundOff ? /*#__PURE__*/jsx(SvgSpeakerOff, {
              width: 24,
              height: 24
            }) : /*#__PURE__*/jsx(SvgSpeakerOn, {
              width: 24,
              height: 24
            })
          }), /*#__PURE__*/jsx(ProgressCircle, {
            resetTrigger: resetTrigger,
            classNameWrapper: 'mx-auto',
            holdCircleColor: 'primary',
            delay: auctionState.waitRoundMessage?.data.stepDelay ?? 3,
            initialProgress: 100,
            isReverse: true
          }), /*#__PURE__*/jsx("div", {
            className: 'w-10 h-10 !block'
          })]
        }), /*#__PURE__*/jsxs(Title, {
          className: 'font-normal',
          size: 'md',
          children: [t('first-round.other-bidders'), " (", productList.length, ")"]
        }), /*#__PURE__*/jsx(ListProducts, {
          list: productList
        })]
      }), /*#__PURE__*/jsx(Logo, {})]
    }), /*#__PURE__*/jsx("div", {
      className: "widget-screen pt-6 sm:basis-1/2 sm:w-1/2 max-sm:!flex-grow-0",
      children: /*#__PURE__*/jsxs("div", {
        className: "widget-screen-content max-sm:!flex-grow-0",
        children: [/*#__PURE__*/jsx(Title, {
          children: t('second-round.title')
        }), isMobile && /*#__PURE__*/jsxs("div", {
          className: 'flex gap-7 mb-3',
          children: [/*#__PURE__*/jsx(Button, {
            className: 'rounded-full p-0',
            style: {
              width: '40px',
              height: '40px'
            },
            variant: 'secondary',
            onClick: () => setIsSoundOff(p => !p),
            children: isSoundOff ? /*#__PURE__*/jsx(SvgSpeakerOff, {
              width: 24,
              height: 24
            }) : /*#__PURE__*/jsx(SvgSpeakerOn, {
              width: 24,
              height: 24
            })
          }), /*#__PURE__*/jsx(ProgressCircle, {
            resetTrigger: resetTrigger,
            classNameWrapper: 'mx-auto',
            holdCircleColor: 'secondary',
            delay: auctionState.waitRoundMessage?.data.stepDelay ?? 3,
            initialProgress: 100,
            isReverse: true
          }), /*#__PURE__*/jsx("div", {
            className: 'w-10 h-10 !block'
          })]
        }), /*#__PURE__*/jsxs("div", {
          className: 'flex flex-col gap-2',
          children: [/*#__PURE__*/jsxs("div", {
            className: 'flex flex-col gap-1.5 p-4 border border-border rounded-2xl',
            children: [/*#__PURE__*/jsx(Title, {
              size: 'sm',
              tag: 'h3',
              children: "Starting price"
            }), /*#__PURE__*/jsx(Title, {
              size: 'xl',
              tag: 'p',
              children: !isNullable(auctionState.selectionMessage?.data.price) && getPriceWithCurrency(auctionState.selectionMessage?.data.price, 'USD')
            })]
          }), /*#__PURE__*/jsx(AuctionPrice, {
            title: t('second-round.auction-price.title')
            // title={'Your price now'}
            ,
            description: t('second-round.auction-price.description')
            // description={'Unbroked bid wins!'}
            ,
            price: auctionState.roundStepMessage?.data.price,
            disabled: isPriceCatch || auctionState.isFirstRoundWinner || auctionState.isSecondRoundWinner,
            borderColor: isPriceCatch ? 'gradient' : 'gray',
            currencyCode: auctionState.selectionMessage?.data.currency,
            onClick: handleCatchPrice
          }), /*#__PURE__*/jsx("ul", {
            className: 'sm:grid sm:grid-cols-2 flex gap-2 w-full overflow-x-auto max-sm:pb-1',
            children: [...customerProducts, ...productList].map(product => /*#__PURE__*/jsx("li", {
              className: 'flex items-center justify-center w-full h-auto aspect-square border border-border rounded-2xl p-2 sm:p-4 max-sm:min-w-20',
              children: /*#__PURE__*/jsx("img", {
                className: 'w-full h-full object-contain',
                src: product.imgUrl,
                alt: product.imgAlt,
                width: 101,
                height: 101
              })
            }, product.imgUrl + 'img'))
          })]
        }), /*#__PURE__*/jsx(ClampText, {
          lines: 3,
          hasToggleButton: true,
          children: t('second-round.description')
        })]
      })
    })]
  });
};
AuctionBidding.displayName = 'AuctionBidding';

const AuctionResults = () => {
  const {
    setIsOpen,
    auctionState,
    handleResetAuction,
    handleUseWinData
  } = useContext(WidgetContext);
  const {
    t
  } = useI18n();
  const isWinner = auctionState.isFirstRoundWinner || auctionState.isSecondRoundWinner;
  const results = useMemo(() => {
    const products = auctionState.selectionMessage?.data.products ?? [];
    const product = products[0];
    return [{
      imgUrl: product?.imageUrl,
      imgAlt: product?.name,
      price: auctionState.winnerPrice,
      currencyCode: auctionState.selectionMessage?.data.currency ?? 'USD',
      userName: auctionState.currentCustomer?.name,
      userLocation: auctionState.currentCustomer?.location
    }];
  }, [auctionState]);
  const handleTryAgain = () => {
    handleResetAuction();
    setIsOpen(false);
  };
  return /*#__PURE__*/jsxs("div", {
    className: "widget-screen bg-background-primary text-foreground-primary",
    children: [/*#__PURE__*/jsxs("div", {
      className: "widget-screen-content",
      children: [/*#__PURE__*/jsx(Title, {
        children: t('auction-results.title')
      }), /*#__PURE__*/jsxs("div", {
        className: "flex flex-col gap-2",
        children: [/*#__PURE__*/jsx(Title, {
          size: '3xl',
          variant: 'gradient',
          tag: 'h3',
          children: t(isWinner ? 'auction-results.you-win' : 'auction-results.you-lose')
        }), /*#__PURE__*/jsx(Paragraph, {
          size: 'lg',
          variant: 'gray',
          children: t('auction-results.description')
        })]
      }), /*#__PURE__*/jsx("div", {
        className: "flex flex-col ",
        children: /*#__PURE__*/jsxs("div", {
          className: "flex flex-col gap-4 w-full",
          children: [/*#__PURE__*/jsx(ListProducts, {
            list: results
          }), isWinner && /*#__PURE__*/jsxs(Fragment, {
            children: [/*#__PURE__*/jsx("hr", {
              className: "border-t border-border"
            }), /*#__PURE__*/jsxs("div", {
              className: 'flex flex-col gap-2',
              children: [/*#__PURE__*/jsxs("div", {
                className: "flex items-center justify-between",
                children: [/*#__PURE__*/jsx(Paragraph, {
                  size: 'xs',
                  children: t('auction-results.prev-price')
                }), /*#__PURE__*/jsx(Paragraph, {
                  size: 'xs',
                  children: !isNullable(auctionState.selectionMessage?.data.price) && getPriceWithCurrency(auctionState.selectionMessage?.data.price, auctionState.selectionMessage?.data.currency)
                })]
              }), /*#__PURE__*/jsxs("div", {
                className: "flex items-center justify-between",
                children: [/*#__PURE__*/jsx(Paragraph, {
                  size: 'xs',
                  children: t('auction-results.current-price')
                }), /*#__PURE__*/jsx(Title, {
                  size: 'xl',
                  tag: 'p',
                  children: !isNullable(auctionState.winnerPrice) && getPriceWithCurrency(auctionState.winnerPrice, auctionState.selectionMessage?.data.currency)
                })]
              })]
            })]
          }), /*#__PURE__*/jsx("hr", {
            className: "border-t border-border"
          }), /*#__PURE__*/jsxs("div", {
            className: "flex flex-col gap-2",
            children: [isWinner && /*#__PURE__*/jsx(Button, {
              onClick: handleUseWinData,
              children: t('buttons.buy-this-price')
            }), /*#__PURE__*/jsx(Button, {
              variant: 'secondary',
              onClick: handleTryAgain,
              children: t('buttons.try-again')
            })]
          })]
        })
      })]
    }), /*#__PURE__*/jsx(Logo, {})]
  });
};
AuctionResults.displayName = 'AuctionResults';

const Input = ({
  className,
  type,
  label,
  error,
  id,
  ...rest
}) => {
  const hasError = !!error;
  return /*#__PURE__*/jsxs("div", {
    className: "flex flex-col gap-2",
    children: [!!label && /*#__PURE__*/jsx("label", {
      htmlFor: id,
      className: 'mb-1 text-xs leading-3.5',
      children: label
    }), /*#__PURE__*/jsx("input", {
      id: id,
      type: type ?? 'text',
      className: cn('w-full transition bg-background-secondary rounded-[32px] px-4 py-2 h-9 text-xs border border-transparent text-foreground-secondary placeholder:text-foreground-secondary/40 outline-none', className, {
        '!border-error': hasError
      }),
      ...rest
    }), hasError && /*#__PURE__*/jsx(Paragraph, {
      variant: 'error',
      size: 'xs',
      children: error
    })]
  });
};
Input.displayName = 'Input';

const SocketUrlInput = () => {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const {
    handleSetSocketUrl,
    handleToggleCustomUrlScreen
  } = useContext(WidgetContext);
  const handleInputChange = e => {
    const newValue = e.target.value.trim();
    if (error && newValue) {
      setError(null);
    }
    setValue(newValue);
  };
  const handleSubmit = () => {
    if (!value) {
      setError('Socket URL cannot be empty');
      return;
    }
    handleSetSocketUrl(value);
    handleToggleCustomUrlScreen(false);
  };
  return /*#__PURE__*/jsx("div", {
    className: "widget-screen bg-background-primary text-foreground-primary",
    children: /*#__PURE__*/jsxs("div", {
      className: "widget-screen-content py-8",
      children: [/*#__PURE__*/jsx(Input
      // label={'Enter your name to take part in auction'}
      // placeholder='Your name'
      // error={'Something went wrong'}
      , {
        name: 'userName',
        type: 'text',
        id: 'userName',
        label: 'Socket URL',
        placeholder: 'Socket URL',
        error: error,
        value: value,
        onChange: handleInputChange
      }), /*#__PURE__*/jsx(Button, {
        onClick: handleSubmit,
        children: "Submit"
      }), /*#__PURE__*/jsx(Button, {
        variant: 'secondary',
        onClick: () => handleToggleCustomUrlScreen(false),
        children: "Back"
      })]
    })
  });
};
SocketUrlInput.displayName = 'SocketUrlInput';

const AuctionCart = () => {
  const {
    isAuctionStarting,
    cart,
    customerName,
    currency,
    setIsOpen,
    handleStartAuction,
    handleToggleCustomUrlScreen
  } = useContext(WidgetContext);
  const [name, setName] = useState(customerName ?? '');
  const [isFieldTouched, setIsFieldTouched] = useState(false);
  const {
    t
  } = useI18n();
  const totalPrice = cart?.reduce((acc, item) => {
    const priceNum = item.price ? +item.price : 0;
    return acc + (!isNaN(priceNum) ? priceNum : 0);
  }, 0) ?? 0;
  const productsList = useMemo(() => {
    return cart?.map(item => ({
      imgUrl: item.imageUrl,
      imgAlt: item.name,
      price: item.price ?? null,
      currencyCode: currency ?? '',
      userName: customerName ?? null
    })) ?? [];
  }, [cart, currency, customerName]);
  const handleStart = async () => {
    handleStartAuction(name);
  };
  const handleInputChange = e => {
    setName(e.target.value);
  };
  const handleInputFocus = () => {
    if (isFieldTouched) {
      return;
    }
    setIsFieldTouched(true);
  };
  return /*#__PURE__*/jsxs("div", {
    className: "widget-screen bg-background-primary text-foreground-primary",
    children: [/*#__PURE__*/jsxs("div", {
      className: "widget-screen-content",
      children: [/*#__PURE__*/jsx("div", {
        className: "flex justify-between items-center",
        children: /*#__PURE__*/jsx(Title, {
          children: t('cart.title')
        })
      }), /*#__PURE__*/jsx("div", {
        className: "flex flex-col ",
        children: /*#__PURE__*/jsxs("div", {
          className: "flex flex-col gap-4 w-full",
          children: [/*#__PURE__*/jsx(ListProducts, {
            list: productsList
          }), /*#__PURE__*/jsx("hr", {
            className: "border-t border-border"
          }), /*#__PURE__*/jsxs("div", {
            className: "flex items-center justify-between",
            children: [/*#__PURE__*/jsx("div", {
              className: "text-xs",
              children: t('cart.total-start-price')
            }), /*#__PURE__*/jsx(Paragraph, {
              className: "text-xl font-semibold",
              children: totalPrice > 0 && getPriceWithCurrency(totalPrice, currency ?? 'USD')
            })]
          }), /*#__PURE__*/jsx(Input
          // label={'Enter your name to take part in auction'}
          // placeholder='Your name'
          // error={'Something went wrong'}
          , {
            name: 'userName',
            type: 'text',
            id: 'userName',
            label: t('cart.input.label'),
            placeholder: t('cart.input.placeholder'),
            error: !name && isFieldTouched ? t('cart.input.error') : false,
            value: name,
            onChange: handleInputChange,
            onFocus: handleInputFocus,
            autoComplete: 'name'
          }), /*#__PURE__*/jsx("hr", {
            className: "border-t border-border"
          }), /*#__PURE__*/jsxs("div", {
            className: "flex flex-col gap-2",
            children: [/*#__PURE__*/jsx(Button, {
              disabled: !name || isAuctionStarting,
              onClick: handleStart,
              children: t(isAuctionStarting ? 'cart.start-auction.loading' : 'cart.start-auction')
            }), /*#__PURE__*/jsx(Button, {
              variant: 'secondary',
              onClick: () => setIsOpen(false),
              children: t('cart.to-catalog')
            }), /*#__PURE__*/jsx(Button, {
              variant: 'secondary',
              onClick: () => handleToggleCustomUrlScreen(true),
              children: "Add socket URL manually"
            })]
          })]
        })
      })]
    }), /*#__PURE__*/jsx(Logo, {})]
  });
};
AuctionCart.displayName = 'AuctionCart';

function Widget() {
  const {
    auctionState,
    isCustomUrlScreen,
    isOpen,
    setIsOpen
  } = useContext(WidgetContext);
  const wrapperRef = useRef(null);
  const isDoubleScreen = auctionState.currentStage === STAGE_SCREENS_ENUM.SECOND_ROUND || auctionState.currentStage === STAGE_SCREENS_ENUM.FIRST_ROUND;
  const Screen = useCallback(() => {
    if (isCustomUrlScreen) {
      return /*#__PURE__*/jsx(SocketUrlInput, {});
    }
    switch (auctionState.currentStage) {
      case STAGE_SCREENS_ENUM.RESULTS:
        return /*#__PURE__*/jsx(AuctionResults, {});
      case STAGE_SCREENS_ENUM.SECOND_ROUND:
        return /*#__PURE__*/jsx(AuctionBidding, {});
      case STAGE_SCREENS_ENUM.FIRST_ROUND:
        return /*#__PURE__*/jsx(AuctionBiddingFirstRound, {});
      case STAGE_SCREENS_ENUM.WAIT_FIRST_ROUND:
      case STAGE_SCREENS_ENUM.WAIT_SECOND_ROUND:
        return /*#__PURE__*/jsx(BiddingPreparation, {});
      case STAGE_SCREENS_ENUM.SELECTION:
      case STAGE_SCREENS_ENUM.CART:
      default:
        return /*#__PURE__*/jsx(AuctionCart, {});
    }
  }, [auctionState.currentStage, isCustomUrlScreen]);
  return /*#__PURE__*/jsxs("div", {
    ref: wrapperRef,
    className: 'widget-app-wrapper',
    children: [/*#__PURE__*/jsx("div", {
      onClick: () => setIsOpen(false),
      className: cn('fixed inset-0 bg-black opacity-25 z-[9998]', {
        '!block': isOpen,
        hidden: !isOpen
      })
    }), /*#__PURE__*/jsx(FloatTriggers, {
      className: cn({
        hidden: isOpen
      })
    }), /*#__PURE__*/jsxs("div", {
      onClick: e => e.stopPropagation(),
      className: cn('widget-container flex-col w-full flex h-screen bg-white border border-gray-200 shadow-lg z-[9999]', 'fixed top-0 bottom-0 right-0 h-screen overflow-auto transition duration-300', isDoubleScreen ? 'sm:max-w-151' : 'sm:max-w-73', {
        'opacity-0 pointer-events-none invisible': !isOpen
      }),
      children: [/*#__PURE__*/jsx(Button, {
        className: 'absolute top-3 sm:top-2 right-3',
        variant: 'icon',
        onClick: () => setIsOpen(false),
        "aria-label": "Close",
        children: /*#__PURE__*/jsx(SvgX, {
          width: "20",
          height: "20",
          className: 'text-foreground-primary'
        })
      }), /*#__PURE__*/jsx(Screen, {})]
    })]
  });
}

const STORAGE_KEYS = {
  CART: 'cart'
};

const initialState = {
  isOpen: false,
  isInfoOpen: false,
  isCustomUrlScreen: false,
  isAuctionStarting: false,
  currency: 'USD',
  customerName: null,
  cart: []
};
const addToCart = product => {
  try {
    const storageCart = Storage.get(STORAGE_KEYS.CART);
    const newCart = storageCart ? [...storageCart] : [];
    if (!storageCart) {
      newCart.push(product);
      Storage.set(STORAGE_KEYS.CART, newCart);
      return newCart;
    }
    const hasInCart = newCart.find(item => item.id === product.id);
    if (hasInCart) {
      return newCart;
    }
    newCart.push(product);
    Storage.set(STORAGE_KEYS.CART, newCart);
    return newCart;
  } catch (error) {
    console.warn('[HobuyWidget] Error adding product to cart:', error);
    return null;
  }
};
function widgetReducer(state, action) {
  switch (action.type) {
    case 'SET_IS_CUSTOM_URL_SCREEN':
      return {
        ...state,
        isCustomUrlScreen: action.payload
      };
    case 'SET_IS_AUCTION_STARTING':
      return {
        ...state,
        isAuctionStarting: action.payload
      };
    case 'SET_IS_OPEN':
      return {
        ...state,
        isOpen: action.payload
      };
    case 'SET_CUSTOMER_NAME':
      return {
        ...state,
        customerName: action.payload
      };
    case 'SET_IS_INFO_OPEN':
      return {
        ...state,
        isInfoOpen: action.payload
      };
    case 'SET_CURRENCY':
      return {
        ...state,
        currency: action.payload
      };
    case 'SET_CART':
      return {
        ...state,
        cart: action.payload
      };
    case 'ADD_TO_CART':
      return {
        ...state,
        isOpen: true,
        cart: addToCart(action.payload) || state.cart
      };
    case 'CLEAR_CART':
      return {
        ...state,
        isOpen: true,
        cart: []
      };
    default:
      return state;
  }
}
const useWidgetState = ({
  product,
  shopCurrency,
  customerName,
  onStartAuction,
  setSocketUrl
}) => {
  const [state, dispatch] = useReducer(widgetReducer, initialState);
  useEffect(() => {
    const storedCart = Storage.get(STORAGE_KEYS.CART);
    if (storedCart) {
      dispatch({
        type: 'SET_CART',
        payload: storedCart
      });
    }
  }, []);
  useEffect(() => {
    if (shopCurrency) {
      dispatch({
        type: 'SET_CURRENCY',
        payload: shopCurrency
      });
    }
  }, [shopCurrency]);
  useEffect(() => {
    if (customerName) {
      dispatch({
        type: 'SET_CUSTOMER_NAME',
        payload: customerName
      });
    }
  }, [customerName]);
  const handleAddVariationToCart = () => {
    if (!product) {
      console.warn('[HobuyWidget] No product provided to add to cart');
      return;
    }
    try {
      dispatch({
        type: 'SET_IS_OPEN',
        payload: true
      });
      dispatch({
        type: 'ADD_TO_CART',
        payload: product
      });
    } catch (e) {
      console.warn('[HobuyWidget] Error adding product to cart:', e);
    }
  };
  const handleSetIsOpen = v => dispatch({
    type: 'SET_IS_OPEN',
    payload: v
  });
  const handleSetIsInfoOpen = v => dispatch({
    type: 'SET_IS_INFO_OPEN',
    payload: v
  });
  const handleStartAuction = async name => {
    if (!onStartAuction) {
      return;
    }
    dispatch({
      type: 'SET_IS_AUCTION_STARTING',
      payload: true
    });
    const result = await onStartAuction(state.cart ?? [], name);
    dispatch({
      type: 'SET_IS_AUCTION_STARTING',
      payload: false
    });
    console.log('[handleStartAuction] result: ', result);
    if (!result) {
      console.warn('[HobuyWidget] onStartAuction did not return a result');
      return;
    }
    console.log('[handleStartAuction] result: ', result);
    setSocketUrl(result.socketUrl);
  };
  const handleClearCart = () => {
    dispatch({
      type: 'CLEAR_CART'
    });
    Storage.remove(STORAGE_KEYS.CART);
  };
  const handleToggleCustomUrlScreen = isCustomUrlScreen => {
    dispatch({
      type: 'SET_IS_CUSTOM_URL_SCREEN',
      payload: isCustomUrlScreen
    });
  };
  return {
    state,
    handleSetIsOpen,
    handleSetIsInfoOpen,
    handleAddVariationToCart,
    handleStartAuction,
    handleClearCart,
    handleToggleCustomUrlScreen
  };
};

function HobuyWidget({
  socketUrl,
  locale,
  injectToBody = true,
  product,
  shopCurrency,
  customerName,
  onStartAuction,
  onUseWinData
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [wssUrl, setWssUrl] = useState(socketUrl);
  const {
    state,
    handleSetIsOpen,
    handleSetIsInfoOpen,
    handleAddVariationToCart,
    handleStartAuction,
    handleClearCart,
    handleToggleCustomUrlScreen
  } = useWidgetState({
    product,
    shopCurrency,
    customerName,
    onStartAuction,
    setSocketUrl: setWssUrl
  });
  const {
    setLang
  } = useI18n();
  const {
    auctionSocket,
    auctionState,
    handleAuctionSendMessage,
    handleResetAuction
  } = useAuction({
    url: wssUrl
  });
  const handleUseWinData = () => {
    onUseWinData?.(auctionState.winData, {
      handleClearAuctionCart: () => {
        handleClearCart();
      }
    });
  };
  useEffect(() => {
    setWssUrl(wssUrl);
  }, [wssUrl]);
  useEffect(() => {
    if (locale) {
      setLang(locale);
    }
  }, [locale]);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  if (!isMounted) {
    return null;
  }
  return /*#__PURE__*/jsx(WidgetContext.Provider, {
    value: {
      auctionSocket,
      auctionState,
      cart: state.cart,
      customerName: state.customerName,
      currency: state.currency,
      isAuctionStarting: state.isAuctionStarting,
      isCustomUrlScreen: state.isCustomUrlScreen,
      isOpen: state.isOpen,
      handleSetSocketUrl: setWssUrl,
      isInfoOpen: state.isInfoOpen,
      setIsOpen: handleSetIsOpen,
      setIsInfoOpen: handleSetIsInfoOpen,
      handleAuctionSendMessage,
      handleResetAuction,
      handleAddVariationToCart,
      handleStartAuction,
      handleUseWinData,
      handleToggleCustomUrlScreen
    },
    children: injectToBody ? /*#__PURE__*/createPortal(/*#__PURE__*/jsx(Widget, {}), document.body) : /*#__PURE__*/jsx(Widget, {})
  });
}

export { HobuyWidget as default };
//# sourceMappingURL=index.js.map
