import {
  ActionPanel,
  List,
  showToast,
  Toast,
  getPreferenceValues,
  OpenInBrowserAction,
  CopyToClipboardAction,
  useNavigation,
  Detail,
  Icon,
  Color,
} from "@raycast/api";
import { useState, useEffect, useRef, useCallback } from "react";
import fetch, { AbortError } from "node-fetch";
import crypto from "crypto";
import qs from "querystring";

export default function Command() {
  const { state, search } = useSearch();

  return (
    <List isLoading={state.isLoading} onSearchTextChange={search} searchBarPlaceholder="translate..." throttle>
      {state.result.translation ? (
        <List.Section title="Translate">
          {state.result.translation.map((item: string, index: number) => (
            <List.Item
              key={index}
              title={item}
              icon={{ source: Icon.Dot, tintColor: Color.Red }}
              actions={
                <TranslateResultActionPanel
                  copy_content={item}
                  url={
                    state.result.webdict && state.result.webdict.url
                      ? youDaoPcDictURL(state.result.webdict.url)
                      : undefined
                  }
                />
              }
            />
          ))}
        </List.Section>
      ) : null}
      {state.result.basic && state.result.basic.explains && state.result.basic.explains.length > 0 ? (
        <List.Section title="Detail">
          {state.result.basic.explains.map((item: string, index: number) => (
            <List.Item
              key={index}
              title={item}
              icon={{ source: Icon.Dot, tintColor: Color.Blue }}
              actions={
                <TranslateResultActionPanel
                  copy_content={item}
                  url={
                    state.result.webdict && state.result.webdict.url
                      ? youDaoPcDictURL(state.result.webdict.url)
                      : undefined
                  }
                />
              }
            />
          ))}
        </List.Section>
      ) : null}
      {state.result.web && state.result.web.length > 0 ? (
        <List.Section title="Web Translate">
          {state.result.web.map((item: translateWebResult, index: number) => (
            <List.Item
              key={index}
              title={item.value.join(", ")}
              icon={{ source: Icon.Dot, tintColor: Color.Yellow }}
              subtitle={item.key}
              actions={
                <TranslateResultActionPanel
                  copy_content={item.value.join(", ")}
                  url={
                    state.result.webdict && state.result.webdict.url
                      ? youDaoPcDictURL(state.result.webdict.url)
                      : undefined
                  }
                />
              }
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

function youDaoPcDictURL(webdictUrl: string): string {
  const params = qs.parse(webdictUrl);
  return `https://youdao.com/w/${params.le}/${params.q}`;
}

function useSearch() {
  const [state, setState] = useState<SearchState>({ result: {} as translateResult, isLoading: true });
  const cancelRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async function search(searchText: string) {
      cancelRef.current?.abort();
      cancelRef.current = new AbortController();
      setState((oldState) => ({
        ...oldState,
        isLoading: true,
      }));
      try {
        const results = await translateAPI(searchText, cancelRef.current.signal);
        setState((oldState) => ({
          ...oldState,
          result: results,
          isLoading: false,
        }));
      } catch (error) {
        setState((oldState) => ({
          ...oldState,
          isLoading: false,
        }));

        if (error instanceof AbortError) {
          return;
        }

        console.error("search error", error);
        showToast({ style: Toast.Style.Failure, title: "Could not perform translate", message: String(error) });
      }
    },
    [cancelRef, setState]
  );

  useEffect(() => {
    search("");
    return () => {
      cancelRef.current?.abort();
    };
  }, []);

  return {
    state: state,
    search: search,
  };
}

function TranslateResultActionPanel(props: { copy_content: string; url: string | undefined }) {
  const { copy_content, url } = props;
  return (
    <ActionPanel>
      <CopyToClipboardAction content={copy_content} />
      {url ? <OpenInBrowserAction url={url} /> : null}
    </ActionPanel>
  );
}

function generateSign(content: string, salt: number, app_key: string, app_secret: string) {
  const md5 = crypto.createHash("md5");
  md5.update(app_key + content + salt + app_secret);
  const cipher = md5.digest("hex");
  return cipher.slice(0, 32).toUpperCase();
}

async function translateAPI(content: string, signal: AbortSignal): Promise<translateResult> {
  if (content === "") {
    // set default query to hello world
    content = "hello world"
  }

  const { app_key, app_secret, from_lang, to_lang } = getPreferenceValues();
  const q = Buffer.from(content).toString();
  const salt = Date.now();
  const sign = generateSign(q, salt, app_key, app_secret);
  const query = qs.stringify({ q: q, appKey: app_key, from: from_lang, to: to_lang, salt, sign });

  const response = await fetch(`https://openapi.youdao.com/api?${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: signal,
  });

  const json = (await response.json()) as translateResult;

  if (json.errorCode && json.errorCode !== "0") {
    throw new Error(`translate failed, error code is ${json.errorCode}`);
  }

  return json;
}

interface translateResult {
  translation?: Array<string>;
  isWord: boolean;
  basic?: { phonetic?: string; explains?: Array<string> };
  l: string;
  web?: Array<translateWebResult>;
  webdict?: { url: string };
  errorCode: string;
}

interface translateWebResult {
  value: Array<string>;
  key: string;
}

interface SearchState {
  result: translateResult;
  isLoading: boolean;
}
