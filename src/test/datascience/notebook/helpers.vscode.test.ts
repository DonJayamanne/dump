// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { nbformat } from '@jupyterlab/coreutils';
import { assert, use } from 'chai';
import chaiExclude from 'chai-exclude';
import { NotebookCellOutput, NotebookCellOutputItem, NotebookCellKind, NotebookCellData } from 'vscode';
import { MARKDOWN_LANGUAGE, PYTHON_LANGUAGE } from '../../../client/common/constants';
import { notebookModelToVSCNotebookData } from '../../../client/datascience/notebook/helpers/helpers';
use(chaiExclude);
suite('DataScience - VSCode Notebook - helpers', () => {
    const base64EncodedImage =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mOUlZL6DwAB/wFSU1jVmgAAAABJRU5ErkJggg==';
    test('Convert NotebookModel to VSCode NotebookData', async () => {
        const cells = [
            {
                cell_type: 'code',
                execution_count: 10,
                outputs: [],
                source: 'print(1)',
                metadata: {}
            },
            {
                cell_type: 'markdown',
                source: '# HEAD',
                metadata: {}
            }
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const notebook = notebookModelToVSCNotebookData({}, cells as any, PYTHON_LANGUAGE, {});

        assert.isOk(notebook);

        const codeCellData = new NotebookCellData(NotebookCellKind.Code, 'print(1)', PYTHON_LANGUAGE);
        codeCellData.outputs = [];
        codeCellData.metadata = {
            custom: { metadata: {} }
        };
        codeCellData.executionSummary = {
            executionOrder: 10
        };
        const markdownCellData = new NotebookCellData(NotebookCellKind.Markup, '# HEAD', MARKDOWN_LANGUAGE);

        markdownCellData.outputs = [];
        markdownCellData.metadata = {
            custom: { metadata: {} }
        };

        assert.deepEqual(notebook.cells, [codeCellData, markdownCellData]);
    });
    suite('Outputs', () => {
        function validateCellOutputTranslation(
            outputs: nbformat.IOutput[],
            expectedOutputs: NotebookCellOutput[],
            propertiesToExcludeFromComparison: string[] = []
        ) {
            const cells = [
                {
                    cell_type: 'code',
                    execution_count: 10,
                    outputs,
                    source: 'print(1)',
                    metadata: {}
                }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const notebook = notebookModelToVSCNotebookData({}, cells, PYTHON_LANGUAGE, {});

            // OutputItems contain an `id` property generated by VSC.
            // Exclude that property when comparing.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const propertiesToExclude = propertiesToExcludeFromComparison.concat(['id']) as any;
            assert.deepEqualExcluding(notebook.cells[0].outputs, expectedOutputs, propertiesToExclude);
        }
        test('Empty output', () => {
            validateCellOutputTranslation([], []);
        });
        test('Stream output', () => {
            validateCellOutputTranslation(
                [
                    {
                        output_type: 'stream',
                        name: 'stderr',
                        text: 'Error'
                    },
                    {
                        output_type: 'stream',
                        name: 'stdout',
                        text: 'NoError'
                    }
                ],
                [
                    new NotebookCellOutput([NotebookCellOutputItem.stderr('Error')], {
                        outputType: 'stream'
                    }),
                    new NotebookCellOutput([NotebookCellOutputItem.stdout('NoError')], {
                        outputType: 'stream'
                    })
                ]
            );
        });
        test('Streamed text with Ansi characters', async () => {
            validateCellOutputTranslation(
                [
                    {
                        name: 'stderr',
                        text: '\u001b[K\u001b[33m??? \u001b[0m Loading\n',
                        output_type: 'stream'
                    }
                ],
                [
                    new NotebookCellOutput(
                        [NotebookCellOutputItem.stderr('\u001b[K\u001b[33m??? \u001b[0m Loading\n')],
                        {
                            outputType: 'stream'
                        }
                    )
                ]
            );
        });
        test('Streamed text with angle bracket characters', async () => {
            validateCellOutputTranslation(
                [
                    {
                        name: 'stderr',
                        text: '1 is < 2',
                        output_type: 'stream'
                    }
                ],
                [
                    new NotebookCellOutput([NotebookCellOutputItem.stderr('1 is < 2')], {
                        outputType: 'stream'
                    })
                ]
            );
        });
        test('Streamed text with angle bracket characters and ansi chars', async () => {
            validateCellOutputTranslation(
                [
                    {
                        name: 'stderr',
                        text: '1 is < 2\u001b[K\u001b[33m??? \u001b[0m Loading\n',
                        output_type: 'stream'
                    }
                ],
                [
                    new NotebookCellOutput(
                        [NotebookCellOutputItem.stderr('1 is < 2\u001b[K\u001b[33m??? \u001b[0m Loading\n')],
                        {
                            outputType: 'stream'
                        }
                    )
                ]
            );
        });
        test('Error', async () => {
            validateCellOutputTranslation(
                [
                    {
                        ename: 'Error Name',
                        evalue: 'Error Value',
                        traceback: ['stack1', 'stack2', 'stack3'],
                        output_type: 'error'
                    }
                ],
                [
                    new NotebookCellOutput(
                        [
                            NotebookCellOutputItem.error({
                                name: 'Error Name',
                                message: 'Error Value',
                                stack: ['stack1', 'stack2', 'stack3'].join('\n')
                            })
                        ],
                        {
                            outputType: 'error',
                            originalError: {
                                ename: 'Error Name',
                                evalue: 'Error Value',
                                traceback: ['stack1', 'stack2', 'stack3'],
                                output_type: 'error'
                            }
                        }
                    )
                ]
            );
        });

        ['display_data', 'execute_result'].forEach((output_type) => {
            suite(`Rich output for output_type = ${output_type}`, () => {
                // Properties to exclude when comparing.
                let propertiesToExcludeFromComparison: string[] = [];
                setup(() => {
                    if (output_type === 'display_data') {
                        // With display_data the execution_count property will never exist in the output.
                        // We can ignore that (as it will never exist).
                        // But we leave it in the case of `output_type === 'execute_result'`
                        propertiesToExcludeFromComparison = ['execution_count', 'executionCount'];
                    }
                });
                test('Text mimeType output', async () => {
                    validateCellOutputTranslation(
                        [
                            {
                                data: {
                                    'text/plain': 'Hello World!'
                                },
                                output_type,
                                metadata: {},
                                execution_count: 1
                            }
                        ],
                        [
                            new NotebookCellOutput(
                                [new NotebookCellOutputItem(Buffer.from('Hello World!', 'utf8'), 'text/plain')],
                                {
                                    outputType: output_type,
                                    metadata: {}, // display_data & execute_result always have metadata.
                                    executionCount: 1
                                }
                            )
                        ],
                        propertiesToExcludeFromComparison
                    );
                });

                test('png,jpeg images', async () => {
                    validateCellOutputTranslation(
                        [
                            {
                                execution_count: 1,
                                data: {
                                    'image/png': base64EncodedImage,
                                    'image/jpeg': base64EncodedImage
                                },
                                metadata: {},
                                output_type
                            }
                        ],
                        [
                            new NotebookCellOutput(
                                [
                                    new NotebookCellOutputItem(Buffer.from(base64EncodedImage, 'base64'), 'image/png'),
                                    new NotebookCellOutputItem(Buffer.from(base64EncodedImage, 'base64'), 'image/jpeg')
                                ],
                                {
                                    executionCount: 1,
                                    outputType: output_type,
                                    metadata: {} // display_data & execute_result always have metadata.
                                }
                            )
                        ],
                        propertiesToExcludeFromComparison
                    );
                });
                test('png image with a light background', async () => {
                    validateCellOutputTranslation(
                        [
                            {
                                execution_count: 1,
                                data: {
                                    'image/png': base64EncodedImage
                                },
                                metadata: {
                                    needs_background: 'light'
                                },
                                output_type
                            }
                        ],
                        [
                            new NotebookCellOutput(
                                [new NotebookCellOutputItem(Buffer.from(base64EncodedImage, 'base64'), 'image/png')],
                                {
                                    executionCount: 1,
                                    metadata: {
                                        needs_background: 'light'
                                    },
                                    outputType: output_type
                                }
                            )
                        ],
                        propertiesToExcludeFromComparison
                    );
                });
                test('png image with a dark background', async () => {
                    validateCellOutputTranslation(
                        [
                            {
                                execution_count: 1,
                                data: {
                                    'image/png': base64EncodedImage
                                },
                                metadata: {
                                    needs_background: 'dark'
                                },
                                output_type
                            }
                        ],
                        [
                            new NotebookCellOutput(
                                [new NotebookCellOutputItem(Buffer.from(base64EncodedImage, 'base64'), 'image/png')],
                                {
                                    executionCount: 1,
                                    metadata: {
                                        needs_background: 'dark'
                                    },
                                    outputType: output_type
                                }
                            )
                        ],
                        propertiesToExcludeFromComparison
                    );
                });
                test('png image with custom dimensions', async () => {
                    validateCellOutputTranslation(
                        [
                            {
                                execution_count: 1,
                                data: {
                                    'image/png': base64EncodedImage
                                },
                                metadata: {
                                    'image/png': { height: '111px', width: '999px' }
                                },
                                output_type
                            }
                        ],
                        [
                            new NotebookCellOutput(
                                [new NotebookCellOutputItem(Buffer.from(base64EncodedImage, 'base64'), 'image/png')],
                                {
                                    executionCount: 1,
                                    metadata: {
                                        'image/png': { height: '111px', width: '999px' }
                                    },
                                    outputType: output_type
                                }
                            )
                        ],
                        propertiesToExcludeFromComparison
                    );
                });
                test('png allowed to scroll', async () => {
                    validateCellOutputTranslation(
                        [
                            {
                                execution_count: 1,
                                data: {
                                    'image/png': base64EncodedImage
                                },
                                metadata: {
                                    unconfined: true,
                                    'image/png': { width: '999px' }
                                },
                                output_type
                            }
                        ],
                        [
                            new NotebookCellOutput(
                                [new NotebookCellOutputItem(Buffer.from(base64EncodedImage, 'base64'), 'image/png')],
                                {
                                    executionCount: 1,
                                    metadata: {
                                        unconfined: true,
                                        'image/png': { width: '999px' }
                                    },
                                    outputType: output_type
                                }
                            )
                        ],
                        propertiesToExcludeFromComparison
                    );
                });
            });
        });
    });
});
